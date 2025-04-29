const express = require("express");
const router = express.Router();
const UserController = require("../controllers/userController");

router.get("/", UserController.getAllUsers);
router.post("/update/:id", UserController.updateUserInfo);
router.get("/delete/:id", UserController.deleteUser);
router.post("/vacation/:id", UserController.vacationUser);

module.exports = router;