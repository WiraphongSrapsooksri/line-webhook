const sql = require('mssql');
const { getConnection } = require('../config/database');

class UserModel {
  static async updateOrCreateUser(userId, displayName, pictureUrl, statusMessage, language) {
    const pool = await getConnection();
    try {
      // Check if user exists
      const result = await pool.request()
        .input('userId', sql.NVarChar, userId)
        .query('SELECT id FROM line_users WHERE line_user_id = @userId');

      if (result.recordset.length > 0) {
        // Update existing user
        await pool.request()
          .input('userId', sql.NVarChar, userId)
          .input('displayName', sql.NVarChar, displayName)
          .input('pictureUrl', sql.NVarChar, pictureUrl)
          .input('statusMessage', sql.NVarChar, statusMessage)
          .input('language', sql.NVarChar, language)
          .query(`
            UPDATE line_users 
            SET display_name = COALESCE(@displayName, display_name),
                picture_url = COALESCE(@pictureUrl, picture_url),
                status_message = COALESCE(@statusMessage, status_message),
                language = COALESCE(@language, language)
            WHERE line_user_id = @userId
          `);
      } else {
        // Create new user
        await pool.request()
          .input('userId', sql.NVarChar, userId)
          .input('displayName', sql.NVarChar, displayName)
          .input('pictureUrl', sql.NVarChar, pictureUrl)
          .input('statusMessage', sql.NVarChar, statusMessage)
          .input('language', sql.NVarChar, language)
          .query(`
            INSERT INTO line_users 
            (line_user_id, display_name, picture_url, status_message, language)
            VALUES (@userId, @displayName, @pictureUrl, @statusMessage, @language)
          `);
      }
    } catch (err) {
      console.error('Error in updateOrCreateUser:', err);
      throw err;
    }
  }

  static async updateLastMessage(userId, message) {
    const pool = await getConnection();
    try {
      await pool.request()
        .input('userId', sql.NVarChar, userId)
        .input('message', sql.NVarChar, message)
        .query(`
          UPDATE line_users 
          SET last_message = @message,
              last_message_timestamp = GETUTCDATE()
          WHERE line_user_id = @userId
        `);
    } catch (err) {
      console.error('Error in updateLastMessage:', err);
      throw err;
    }
  }
}

module.exports = UserModel;