const express = require("express");
const router = express.Router();
const AuthController = require("../controllers/authController");

// router.post("/", AuthController.insertNewUser);
router.post("/login", AuthController.loginUser);
router.get("/recPass", AuthController.recPass);
router.get("/recPass/newPass", AuthController.newPass);

module.exports = router;