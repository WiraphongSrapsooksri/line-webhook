const express = require("express");
const UserController = require("../controllers/userController");
const { getConnection } = require("../config/database");
const sql = require("mssql");

const router = express.Router();

router.get("/", UserController.getAllUsers);
router.get("/search", UserController.searchUsers);
router.get("/stats", UserController.getUserStats);
router.get("/:userId", UserController.getUserById);

router.get("/:userId/images", async (req, res) => {
  try {
    const { userId } = req.params;
    const pool = await getConnection();

    const result = await pool.request().input("userId", sql.NVarChar, userId)
      .query(`
        SELECT 
          message_id,
          image_url,
          created_at
        FROM line_user_images
        WHERE line_user_id = @userId
        ORDER BY created_at DESC
      `);

    res.json({
      status: "success",
      data: result.recordset,
    });
  } catch (error) {
    console.error("Error getting user images:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to get user images",
    });
  }
});

router.get("/userlist", async (req, res) => {
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
    console.log(result.recordset);
    // Process status logic
    const currentDate = new Date();
    const userList = result.recordset.map((user) => {
      let status;
      const lastPaymentDate = user.trans_timestamp
        ? new Date(user.trans_timestamp)
        : null;

      if (!lastPaymentDate) {
        status = "Inactive-NonPaid"; // Never paid
      } else {
        const isCurrentMonth =
          lastPaymentDate.getMonth() === currentDate.getMonth() &&
          lastPaymentDate.getFullYear() === currentDate.getFullYear();

        if (user.last_transaction_status === "on" && isCurrentMonth) {
          status = "Active"; // Paid this month
        } else if (
          currentDate.getDate() === 1 &&
          currentDate.getHours() >= 23
        ) {
          status = "Inactive-NonPaid"; // Not paid and it's past deadline
        } else {
          status = "Billing"; // Awaiting payment
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

    res.json({ status: "success", data: userList });
  } catch (error) {
    console.error("Error fetching user list:", error);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
});

module.exports = router;
