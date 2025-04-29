const express = require("express");
const router = express.Router();
const AuthController = require("../controllers/authController");

// router.post("/", AuthController.insertNewUser);
router.post("/login", AuthController.loginUser);

module.exports = router;