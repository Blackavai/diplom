const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");

router.get("/", reportController.getAllReport);
router.put("/accept/:id", reportController.acceptReport);

module.exports = router;