const sql = require("mssql");
const { getConnection } = require("../config/database");

class UserModel {
  static async updateOrCreateUser(
    userId,
    displayName,
    pictureUrl,
    statusMessage,
    language
  ) {
    const pool = await getConnection();
    try {
      const result = await pool
        .request()
        .input("userId", sql.NVarChar, userId)
        .query("SELECT id FROM line_users_main WHERE line_user_id = @userId");

      if (result.recordset.length > 0) {
        await pool
          .request()
          .input("userId", sql.NVarChar, userId)
          .input("displayName", sql.NVarChar, displayName)
          .input("pictureUrl", sql.NVarChar, pictureUrl)
          .input("statusMessage", sql.NVarChar, statusMessage)
          .input("language", sql.NVarChar, language).query(`
            UPDATE line_users_main 
            SET display_name = COALESCE(@displayName, display_name),
                picture_url = COALESCE(@pictureUrl, picture_url),
                status_message = COALESCE(@statusMessage, status_message),
                language = COALESCE(@language, language),
                updated_at = GETUTCDATE()
            WHERE line_user_id = @userId
          `);
      } else {
        await pool
          .request()
          .input("userId", sql.NVarChar, userId)
          .input("displayName", sql.NVarChar, displayName)
          .input("pictureUrl", sql.NVarChar, pictureUrl)
          .input("statusMessage", sql.NVarChar, statusMessage)
          .input("language", sql.NVarChar, language).query(`
            INSERT INTO line_users_main 
            (line_user_id, display_name, picture_url, status_message, language)
            VALUES (@userId, @displayName, @pictureUrl, @statusMessage, @language)
          `);
      }
    } catch (err) {
      console.error("Error in updateOrCreateUser:", err);
      throw err;
    }
  }

  static async updateLastMessage(userId, message) {
    const pool = await getConnection();
    try {
      await pool
        .request()
        .input("userId", sql.NVarChar, userId)
        .input("message", sql.NVarChar, message).query(`
          UPDATE line_users_main 
          SET last_message = @message,
              last_message_timestamp = GETUTCDATE(),
              updated_at = GETUTCDATE()
          WHERE line_user_id = @userId
        `);
    } catch (err) {
      console.error("Error in updateLastMessage:", err);
      throw err;
    }
  }

  static async saveImageMessage(userId, messageId, imageUrl) {
    const pool = await getConnection();
    try {
      await pool
        .request()
        .input("userId", sql.NVarChar, userId)
        .input("messageId", sql.NVarChar, messageId)
        .input("imageUrl", sql.NVarChar, imageUrl).query(`
          INSERT INTO line_user_images 
          (line_user_id, message_id, image_url, created_at)
          VALUES (@userId, @messageId, @imageUrl, GETUTCDATE())
        `);
    } catch (err) {
      console.error("Error in saveImageMessage:", err);
      throw err;
    }
  }

  static async getPaymentConfig(userId) {
    const pool = await getConnection();
    try {
      const result = await pool.request().input("userId", sql.NVarChar, userId)
        .query(`
          SELECT 
            pc.required_amount,
            u.username
          FROM line_user_payment_config pc
          INNER JOIN userm9 u ON pc.userm9_id = u.id
          WHERE pc.line_user_id = @userId
        `);
      return result.recordset.length > 0 ? result.recordset[0] : null;
    } catch (err) {
      console.error("Error in getPaymentConfig:", err);
      throw err;
    }
  }

  static async saveTransaction({
    line_user_id,
    message_id,
    trans_ref,
    amount,
    required_amount,
    sending_bank,
    receiving_bank,
    trans_timestamp,
    status,
  }) {
    const pool = await getConnection();
    try {
      await pool
        .request()
        .input("line_user_id", sql.NVarChar, line_user_id)
        .input("message_id", sql.NVarChar, message_id)
        .input("trans_ref", sql.NVarChar, trans_ref)
        .input("amount", sql.Decimal(10, 2), amount)
        .input("required_amount", sql.Decimal(10, 2), required_amount)
        .input("sending_bank", sql.NVarChar, sending_bank)
        .input("receiving_bank", sql.NVarChar, receiving_bank)
        .input("trans_timestamp", sql.DateTime2, trans_timestamp)
        .input("status", sql.NVarChar, status).query(`
          INSERT INTO line_user_transactions 
          (line_user_id, message_id, trans_ref, amount, required_amount, sending_bank, receiving_bank, trans_timestamp, status)
          VALUES (@line_user_id, @message_id, @trans_ref, @amount, @required_amount, @sending_bank, @receiving_bank, @trans_timestamp, @status)
        `);
    } catch (err) {
      console.error("Error in saveTransaction:", err);
      throw err;
    }
  }
}

module.exports = UserModel;
