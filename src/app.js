require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const LineService = require('./services/lineService');
const UserModel = require('./models/userModel');
const userRoutes = require('./routes/userRoutes');
const userListPayment = require('./routes/userListPayment');
const billingScheduleRoutes = require('./routes/billingScheduleRoutes');
const path = require('path');
const axios = require('axios');
const logger = require('../logs/index');
const cors = require('cors');
const scheduler = require('./services/scheduler');

const app = express();

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'], 
  credentials: true 
}));

app.use(cors());


if (!lineConfig.channelAccessToken || !lineConfig.channelSecret) {
  logger.error('Missing LINE_CHANNEL_ACCESS_TOKEN or LINE_CHANNEL_SECRET');
  process.exit(1);
}

const client = new line.Client(lineConfig);

const SLIPOK_API_URL = process.env.SLIPOK_API_URL;
const SLIPOK_API_KEY = process.env.SLIPOK_API_KEY;
const STATUS_API_URL = process.env.STATUS_API_URL;
const BASE_URL = process.env.BASE_URL;

if (!SLIPOK_API_URL || !SLIPOK_API_KEY || !STATUS_API_URL || !BASE_URL) {
  logger.error('Missing required environment variables (SLIPOK_API_URL, SLIPOK_API_KEY, STATUS_API_URL, or BASE_URL)');
  process.exit(1);
}

// Middleware
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/users', userRoutes);
app.use('/api/userlistpayment', userListPayment);
app.use('/api/billing-schedule', billingScheduleRoutes);

app.get('/', (req, res) => res.status(200).json({ status: 'ok' }));

// Webhook endpoint
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  try {
    const events = req.body.events;
    logger.info('Received events: ' + JSON.stringify(events, null, 2));

    if (!events || events.length === 0) {
      logger.info('No events received, responding with 200');
      return res.status(200).end();
    }

    await Promise.all(events.map(async (event) => {
      const userId = event.source.userId;
      const replyToken = event.replyToken;
      const isRedelivery = event.deliveryContext?.isRedelivery;

      logger.info(`Processing event for user ${userId}, isRedelivery: ${isRedelivery}`);

      if (isRedelivery) {
        logger.info(`Skipping redelivered event for user ${userId}`);
        await client.replyMessage(replyToken, {
          type: 'text',
          text: 'This slip has already been processed.'
        });
        return;
      }

      try {
        logger.info(`Fetching profile for user ${userId}`);
        const profile = await LineService.getProfile(userId);
        logger.info(`Updating or creating user ${userId}`);
        await UserModel.updateOrCreateUser(
          userId,
          profile.displayName,
          profile.pictureUrl,
          profile.statusMessage,
          profile.language
        );

        if (event.type === 'message') {
          if (event.message.type === 'text') {
            logger.info(`Updating last message for user ${userId}`);
            await UserModel.updateLastMessage(userId, event.message.text);
          } else if (event.message.type === 'image') {
            const messageId = event.message.id;
            logger.info(`Saving image message ${messageId} for user ${userId}`);
            const imageUrl = await LineService.saveImageMessage(messageId, userId);
            await UserModel.saveImageMessage(userId, messageId, imageUrl);

            logger.info(`Fetching payment config for user ${userId}`);
            const paymentConfig = await UserModel.getPaymentConfig(userId);
            if (!paymentConfig) {
              logger.warn(`No payment config found for user ${userId}`);
              await client.replyMessage(replyToken, {
                type: 'text',
                text: 'No payment configuration found. Please contact support.'
              });
              return;
            }

            const { required_amount, username } = paymentConfig;
            logger.info(`Payment config for ${userId}: required_amount=${required_amount}, username=${username}`);

            const fullImageUrl = `${BASE_URL}${imageUrl}`;
            logger.info('Sending to SlipOK: ' + fullImageUrl);
            const slipOkResponse = await axios.post(SLIPOK_API_URL, {
              url: fullImageUrl,
              log: true
            }, {
              headers: {
                'x-authorization': SLIPOK_API_KEY,
                'Content-Type': 'application/json'
              }
            });

            logger.info('SlipOK Response: ' + JSON.stringify(slipOkResponse.data, null, 2));

            const slipData = slipOkResponse.data.data;
            if (!slipData || !slipData.amount) {
              logger.error('Invalid SlipOK response: No slip data or amount detected');
              throw new Error('Invalid SlipOK response: No slip data or amount detected');
            }

            const slipAmount = parseFloat(slipData.amount);
            logger.info(`Slip Amount: ${slipAmount}, Required: ${required_amount}`);

            let status = 'off';
            let replyText = '';
            if (slipAmount >= required_amount) {
              status = 'on';
              replyText = `✅ การชำระเงินถูกต้องจำนวน: ${slipAmount} THB`;
              logger.info(`Payment verified for user ${userId}`);
            } else {
              replyText = `❌ Payment insufficient. Amount: ${slipAmount} THB, Required: ${required_amount} THB`;
              logger.warn(`Payment insufficient for user ${userId}`);
            }

            logger.info(`Saving transaction for user ${userId}`);
            await UserModel.saveTransaction({
              line_user_id: userId,
              message_id: messageId,
              trans_ref: slipData.transRef,
              amount: slipAmount,
              required_amount: required_amount,
              sending_bank: slipData.sendingBank,
              receiving_bank: slipData.receivingBank,
              trans_timestamp: new Date(slipData.transTimestamp),
              status: status
            });

            logger.info(`Updating status for ${username} to ${status}`);
            await axios.put(STATUS_API_URL, {
              username: username,
              status: status
            });
            logger.info(`Status updated for ${username} to ${status}`);

            logger.info(`Replying to user ${userId} with: ${replyText}`);
            await client.replyMessage(replyToken, {
              type: 'text',
              text: replyText
            });
          }
        }
      } catch (error) {
        logger.error(`Error processing event for user ${userId}: ${error.message}`, { stack: error.stack });
        if (axios.isAxiosError(error) && error.response) {
          logger.error('SlipOK Error Details: ' + JSON.stringify(error.response.data, null, 2));
          await client.replyMessage(replyToken, {
            type: 'text',
            text: `Error processing your slip: ${error.response.data.message || 'Unknown error'}`
          });
        } else {
          await client.replyMessage(replyToken, {
            type: 'text',
            text: 'An error occurred while processing your slip. Please try again later.'
          });
        }
      }
    }));

    logger.info('Webhook processed successfully');
    res.status(200).end();
  } catch (error) {
    logger.error('Webhook Error: ' + error.message, { stack: error.stack });
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`, { stack: err.stack });
  if (err instanceof line.SignatureValidationFailed) {
    return res.status(401).json({ status: 'error', message: 'Invalid signature' });
  }
  if (err instanceof line.JSONParseError) {
    return res.status(400).json({ status: 'error', message: 'Invalid JSON' });
  }
  res.status(500).json({ status: 'error', message: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});