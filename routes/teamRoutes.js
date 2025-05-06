const express = require("express");
const router = express.Router();
const teamController = require("../controllers/teamController");

router.get("/", teamController.getAllTeam);
router.post("/create", teamController.createTeam);
router.delete("/delete/:id", teamController.delTeam);
router.put("/edit/:id", teamController.editTeam);
router.post("/newUserTeam/:id", teamController.addUserTeam);

module.exports = router;