const express = require("express");
const router = express.Router();
const TaskController = require("../controllers/taskController");

/**
 * @openapi
 * components:
 *   schemas:
 *     Task:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         content:
 *           type: string
 *           example: "Подготовить отчет"
 *         id_user:
 *           type: integer
 *           example: 5
 *         end_date:
 *           type: string
 *           format: date
 *           example: "2023-12-31"
 *         status:
 *           type: boolean
 *           example: false
 *     Error:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Ошибка сервера"
 */

/**
 * @openapi
 * /api/tasks:
 *   get:
 *     tags: [Tasks]
 *     summary: Получить список всех задач
 *     responses:
 *       200:
 *         description: Успешный ответ
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Task'
 *       500:
 *         description: Ошибка сервера
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

router.get("/", TaskController.getAllTasks);

/**
 * @openapi
 * /api/tasks/new:
 *   post:
 *     tags: [Tasks]
 *     summary: Создать новую задачу
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *               id_user:
 *                 type: integer
 *               end_date:
 *                 type: string
 *                 format: date-time
 *             required:
 *               - content
 *               - id_user
 *     responses:
 *       200:
 *         description: Задача создана или сотрудник в отпуске
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 task:
 *                   $ref: '#/components/schemas/Task'
 *       400:
 *         description: Неверные входные данные
 *       500:
 *         description: Ошибка сервера
 */

router.post("/new", TaskController.addNewTask);

/**
 * @openapi
 * /api/tasks/update/{id}:
 *   put:
 *     tags: [Tasks]
 *     summary: Обновить задачу
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Task'
 *     responses:
 *       200:
 *         description: Задача обновлена
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 *       404:
 *         description: Задача не найдена
 *       500:
 *         description: Ошибка сервера
 */

router.put("/update/:id", TaskController.updateTaskContent);

/**
 * @openapi
 * /api/tasks/delete/{id}:
 *   delete:
 *     tags: [Tasks]
 *     summary: Удалить задачу
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Задача удалена
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 task:
 *                   $ref: '#/components/schemas/Task'
 *       404:
 *         description: Задача не найдена
 *       500:
 *         description: Ошибка сервера
 */

router.delete("/delete/:id", TaskController.deleteTask);

module.exports = router;