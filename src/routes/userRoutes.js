const express = require("express");
const UserController = require("../controllers/userController");
const { getConnection } = require('../config/database');

const router = express.Router();

router.get("/", UserController.getAllUsers);
router.get("/search", UserController.searchUsers);
router.get("/stats", UserController.getUserStats);
router.get("/:userId", UserController.getUserById);
router.get("/list", UserController.getUserList);

router.get("/:userId/images", async (req, res) => {
  try {
    const { userId } = req.params;
    const pool = await getConnection();

    const result = await pool.request()
      .input("userId", sql.NVarChar, userId)
      .query(`
        SELECT 
          message_id,
          image_url,
          created_at
        FROM line_user_images
        WHERE line_user_id = @userId
        ORDER BY created_at DESC
      `);

    res.json({ status: "success", data: result.recordset });
  } catch (error) {
    console.error("Error getting user images:", error);
    res.status(500).json({ status: "error", message: "Failed to get user images" });
  }
});

module.exports = router;
