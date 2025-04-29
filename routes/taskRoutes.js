const express = require("express");
const router = express.Router();
const TaskController = require("../controllers/taskController");

// Определяем маршруты
router.get("/", TaskController.getAllTasks);
// router.get("/:id", TaskController.getTaskById);
// router.put("/:id", TaskController.updateTaskStatus);

module.exports = router;