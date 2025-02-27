require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const LineService = require('./services/lineService');
const UserModel = require('./models/userModel');
const userRoutes = require('./routes/userRoutes');

const app = express();

// Line config
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

// Middleware
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// Simple health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/users', userRoutes);


// Webhook endpoint
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  try {
    const events = req.body.events;
    console.log('Received events:', JSON.stringify(events, null, 2));

    if (!events || events.length === 0) {
      return res.status(200).end();
    }

    // Process each event
    await Promise.all(events.map(async (event) => {
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        
        try {
          // Get user profile
          const profile = await LineService.getProfile(userId);
          // console.log('User profile:', profile);
          
          // Update or create user record
          await UserModel.updateOrCreateUser(
            userId,
            profile.displayName,
            profile.pictureUrl,
            profile.statusMessage,
            profile.language
          );
          
          // Update last message
          await UserModel.updateLastMessage(userId, event.message.text);
          
        } catch (error) {
          console.error('Error processing message:', error);
          // Don't throw error here, continue processing other events
        }
      }
    }));

    res.status(200).end();
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  if (err instanceof line.SignatureValidationFailed) {
    res.status(401).json({
      status: 'error',
      message: 'Invalid signature'
    });
    return;
  }
  if (err instanceof line.JSONParseError) {
    res.status(400).json({
      status: 'error',
      message: 'Invalid JSON'
    });
    return;
  }
  // Handle other errors
  res.status(500).json({
    status: 'error',
    message: 'Internal server error'
  });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});