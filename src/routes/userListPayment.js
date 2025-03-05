const express = require("express");
const UserController = require("../controllers/userController");
const { getConnection } = require('../config/database');

const router = express.Router();

router.get("/listpayment", UserController.getUserList);

module.exports = router;
