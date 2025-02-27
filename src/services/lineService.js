const line = require('@line/bot-sdk');
const fs = require('fs').promises;
const path = require('path');

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(lineConfig);

class LineService {
  static getMiddleware() {
    return line.middleware(lineConfig);
  }

  static async getProfile(userId) {
    try {
      return await client.getProfile(userId);
    } catch (error) {
      console.error('Error getting line profile:', error);
      throw error;
    }
  }

  static async saveImageMessage(messageId, userId) {
    try {
      const stream = await client.getMessageContent(messageId);
      const uploadDir = path.join(__dirname, '..', 'uploads', userId);
      await fs.mkdir(uploadDir, { recursive: true });

      const filePath = path.join(uploadDir, `${messageId}.jpg`);
      const writeStream = require('fs').createWriteStream(filePath);

      await new Promise((resolve, reject) => {
        stream.pipe(writeStream);
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      return `/uploads/${userId}/${messageId}.jpg`;
    } catch (error) {
      console.error('Error saving image message:', error);
      throw error;
    }
  }
}

module.exports = LineService;