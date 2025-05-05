const express = require("express");
const router = express.Router();
const teamController = require("../controllers/teamController");

router.get("/", teamController.getAllTeam);
router.get("/create", teamController.newTeam);
router.get("/delete/:id", teamController.delTeam);
router.get("/edit/:id", teamController.editTeam);
router.get("/", teamController.getAllTeam);
router.put("/accept/:id", teamController.acceptReport);

module.exports = router;