const express = require("express");
const router = express.Router();
const TaskController = require("../controllers/taskController");

// Определяем маршруты
router.get("/", TaskController.getAllTasks);
// router.get("/:id", TaskController.getTaskById);
router.post("/new", TaskController.addNewTask);
router.put("/update/:id", TaskController.updateTaskContent);
router.delete("/delete/:id", TaskController.deleteTask);

module.exports = router;