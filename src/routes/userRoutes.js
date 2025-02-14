const express = require('express');
const UserController = require('../controllers/userController');

const router = express.Router();

// GET /api/users - ดึงข้อมูลผู้ใช้ทั้งหมด
router.get('/', UserController.getAllUsers);

// GET /api/users/search?name=xxx - ค้นหาผู้ใช้ตามชื่อ
router.get('/search', UserController.searchUsers);

// GET /api/users/stats - ดึงสถิติผู้ใช้
router.get('/stats', UserController.getUserStats);

// GET /api/users/:userId - ดึงข้อมูลผู้ใช้ตาม ID
router.get('/:userId', UserController.getUserById);

module.exports = router;