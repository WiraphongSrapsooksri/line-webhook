const sql = require("mssql");
const { getConnection } = require("../config/database");

class UserController {
  // ดึงข้อมูลผู้ใช้ทั้งหมด
  static async getAllUsers(req, res) {
    try {
      const pool = await getConnection();
      const result = await pool.request().query(`
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
        status: "success",
        data: result.recordset,
      });
    } catch (error) {
      console.error("Error getting users:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to get users",
      });
    }
  }

  // ดึงข้อมูลผู้ใช้ตาม ID
  static async getUserById(req, res) {
    try {
      const { userId } = req.params;
      const pool = await getConnection();

      const result = await pool.request().input("userId", sql.NVarChar, userId)
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
          status: "error",
          message: "User not found",
        });
      }

      res.json({
        status: "success",
        data: result.recordset[0],
      });
    } catch (error) {
      console.error("Error getting user:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to get user",
      });
    }
  }

  // ค้นหาผู้ใช้ตามชื่อ
  static async searchUsers(req, res) {
    try {
      const { name } = req.query;
      const pool = await getConnection();

      const result = await pool
        .request()
        .input("name", sql.NVarChar, `%${name}%`).query(`
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
        status: "success",
        data: result.recordset,
      });
    } catch (error) {
      console.error("Error searching users:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to search users",
      });
    }
  }

  // ดึงสถิติผู้ใช้
  static async getUserStats(req, res) {
    try {
      const pool = await getConnection();

      const result = await pool.request().query(`
          SELECT 
            COUNT(*) as total_users,
            COUNT(CASE WHEN last_message_timestamp >= DATEADD(day, -1, GETUTCDATE()) THEN 1 END) as active_last_24h,
            COUNT(CASE WHEN last_message_timestamp >= DATEADD(day, -7, GETUTCDATE()) THEN 1 END) as active_last_7d
          FROM line_users_main
        `);

      res.json({
        status: "success",
        data: result.recordset[0],
      });
    } catch (error) {
      console.error("Error getting user stats:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to get user statistics",
      });
    }
  }

  // static async getUserList(req, res) {
  //   try {
  //     console.log("🟢 Calling getConnection()...");
  //     const pool = await getConnection();
  //     console.log("🟢 Successfully got connection!");

  //     const query = `SELECT 
  //           lum.line_user_id,
  //           lum.display_name,
  //           lum.picture_url,
  //           lum.last_message,
  //           lum.last_message_timestamp,
  //           u9.username,
  //           u9.TYPE,
  //           lupc.required_amount,
  //           lut.status AS last_transaction_status,
  //           lut.trans_timestamp,
  //           lut.amount AS last_payment_amount
  //         FROM line_users_main lum
  //         LEFT JOIN line_user_payment_config lupc 
  //             ON lum.line_user_id = lupc.line_user_id
  //         LEFT JOIN userm9 u9 
  //             ON lupc.userm9_id = u9.id
  //         LEFT JOIN line_user_transactions lut 
  //             ON lum.line_user_id = lut.line_user_id
  //             AND lut.trans_timestamp = (
  //                 SELECT MAX(trans_timestamp)
  //                 FROM line_user_transactions sub
  //                 WHERE sub.line_user_id = lut.line_user_id
  //             );`; // ใช้ query เดิม
  //     const result = await pool.request().query(query);
  //     console.log("Query Result:", result.recordset);

  //     res.json({ status: "success", data: result.recordset });
  //   } catch (error) {
  //     console.error("❌ Error in getUserList:", error);
  //     res
  //       .status(500)
  //       .json({ status: "error", message: "Internal server error" });
  //   }
  // }

  static async getUserList(req, res) {
    try {
      const pool = await getConnection();
      const query = `
          SELECT
            lum.line_user_id,
            lum.display_name,
            lum.picture_url,
            lum.last_message,
            lum.last_message_timestamp,
            u9.username,
            u9.TYPE,
            lupc.required_amount,
            lut.status AS last_transaction_status,
            lut.trans_timestamp,
            lut.amount AS last_payment_amount
          FROM line_users_main lum
          LEFT JOIN line_user_payment_config lupc
              ON lum.line_user_id = lupc.line_user_id
          LEFT JOIN userm9 u9
              ON lupc.userm9_id = u9.id
          LEFT JOIN line_user_transactions lut
              ON lum.line_user_id = lut.line_user_id
              AND lut.trans_timestamp = (
                  SELECT MAX(trans_timestamp)
                  FROM line_user_transactions sub
                  WHERE sub.line_user_id = lut.line_user_id
              );
      `;

      const result = await pool.request().query(query);

      if (!result.recordset || result.recordset.length === 0) {
        return res
          .status(404)
          .json({ status: "error", message: "User not found" });
      }

      const currentDate = new Date();
      const userList = result.recordset.map((user) => {
        let status;
        const lastPaymentDate = user.trans_timestamp
          ? new Date(user.trans_timestamp)
          : null;

        if (!lastPaymentDate) {
          status = "Inactive-NonPaid";
        } else {
          const isCurrentMonth =
            lastPaymentDate.getMonth() === currentDate.getMonth() &&
            lastPaymentDate.getFullYear() === currentDate.getFullYear();

          if (user.last_transaction_status === "on" && isCurrentMonth) {
            status = "Active";
          } else {
            status = "Billing";
          }
        }

        return {
          line_user_id: user.line_user_id,
          display_name: user.display_name,
          picture_url: user.picture_url,
          last_message: user.last_message,
          last_message_timestamp: user.last_message_timestamp,
          username: user.username,
          type: user.TYPE,
          required_amount: user.required_amount,
          last_payment_amount: user.last_payment_amount,
          last_payment_date: user.trans_timestamp,
          status: status,
        };
      });

      return res.json({ status: "success", data: userList });
    } catch (error) {
      console.error("Error fetching user list:", error);
      res
        .status(500)
        .json({ status: "error", message: "Internal server error" });
    }
  }
}

module.exports = UserController;
