const line = require('@line/bot-sdk');

// Line SDK config
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

// Create LINE SDK client
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

  // เพิ่มเมธอดอื่นๆ ที่เกี่ยวกับ Line API ที่นี่
}

module.exports = LineService;