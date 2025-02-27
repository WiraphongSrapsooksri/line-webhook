const sql = require('mssql');
const { getConnection } = require('../config/database');

class UserController {
  // ดึงข้อมูลผู้ใช้ทั้งหมด
  static async getAllUsers(req, res) {
    try {
      const pool = await getConnection();
      const result = await pool.request()
        .query(`
          SELECT 
            line_user_id,
            display_name,
            picture_url,
            status_message,
            language,
            last_message,
            last_message_timestamp,
            created_at,
            updated_at
          FROM line_users_main
          ORDER BY created_at DESC
        `);
      
      res.json({
        status: 'success',
        data: result.recordset
      });
    } catch (error) {
      console.error('Error getting users:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get users'
      });
    }
  }

  // ดึงข้อมูลผู้ใช้ตาม ID
  static async getUserById(req, res) {
    try {
      const { userId } = req.params;
      const pool = await getConnection();
      
      const result = await pool.request()
        .input('userId', sql.NVarChar, userId)
        .query(`
          SELECT 
            line_user_id,
            display_name,
            picture_url,
            status_message,
            language,
            last_message,
            last_message_timestamp,
            created_at,
            updated_at
          FROM line_users_main
          WHERE line_user_id = @userId
        `);

      if (result.recordset.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      res.json({
        status: 'success',
        data: result.recordset[0]
      });
    } catch (error) {
      console.error('Error getting user:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get user'
      });
    }
  }

  // ค้นหาผู้ใช้ตามชื่อ
  static async searchUsers(req, res) {
    try {
      const { name } = req.query;
      const pool = await getConnection();
      
      const result = await pool.request()
        .input('name', sql.NVarChar, `%${name}%`)
        .query(`
          SELECT 
            line_user_id,
            display_name,
            picture_url,
            status_message,
            language,
            last_message,
            last_message_timestamp,
            created_at,
            updated_at
          FROM line_users_main
          WHERE display_name LIKE @name
          ORDER BY created_at DESC
        `);

      res.json({
        status: 'success',
        data: result.recordset
      });
    } catch (error) {
      console.error('Error searching users:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to search users'
      });
    }
  }

  // ดึงสถิติผู้ใช้
  static async getUserStats(req, res) {
    try {
      const pool = await getConnection();
      
      const result = await pool.request()
        .query(`
          SELECT 
            COUNT(*) as total_users,
            COUNT(CASE WHEN last_message_timestamp >= DATEADD(day, -1, GETUTCDATE()) THEN 1 END) as active_last_24h,
            COUNT(CASE WHEN last_message_timestamp >= DATEADD(day, -7, GETUTCDATE()) THEN 1 END) as active_last_7d
          FROM line_users_main
        `);

      res.json({
        status: 'success',
        data: result.recordset[0]
      });
    } catch (error) {
      console.error('Error getting user stats:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get user statistics'
      });
    }
  }
}

module.exports = UserController;