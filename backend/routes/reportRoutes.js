const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");
const { authenticate, requireManager } = require('../middleware/authMiddleware');
router.use(authenticate);

/**
 * @openapi
 * components:
 *   schemas:
 *     Report:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         id_task:
 *           type: integer
 *           example: 1
 *         id_user:
 *           type: integer
 *           example: 5
 *         text_report:
 *           type: string
 *           example: "Текст отчёта"
 *         end_date:
 *           type: string
 *           format: date
 *           example: "2024-01-15"
 *         status_task:
 *           type: boolean
 *           example: true
 *         check_report:
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
 * /api/reports:
 *   get:
 *     tags: [Reports]
 *     summary: Получить список всех отчётов
 *     description: Возвращает массив всех отчётов из системы
 *     responses:
 *       200:
 *         description: Успешный ответ
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Report'
 *       500:
 *         description: Внутренняя ошибка сервера
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

router.get("/", requireManager, reportController.getAllReport);

/**
 * @openapi
 * /api/reports/accept/{id}:
 *   put:
 *     tags: [Reports]
 *     summary: Подтвердить отчёт
 *     description: Помечает отчёт как проверенный (устанавливает check_report = true)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID отчёта для подтверждения
 *         schema:
 *           type: integer
 *           example: 1
 *     responses:
 *       200:
 *         description: Отчёт успешно подтверждён
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Report'
 *       404:
 *         description: Отчёт с указанным ID не найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Внутренняя ошибка сервера
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

router.put("/accept/:id", requireManager, reportController.acceptReport);

/**
 * @openapi
 * /api/reports/new:
 *   post:
 *     tags: [Reports]
 *     summary: Отправить отчёт по своей задаче
 *     description: Доступно обеим ролям. Автор определяется по Bearer JWT; body.id_user игнорируется. Проверка исполнителя, вставка отчёта и завершение задачи атомарны. Несколько отчётов по задаче пока допускаются.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id_task, text_report, end_date]
 *             properties:
 *               id_task:
 *                 type: integer
 *                 minimum: 1
 *               text_report:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 255
 *               end_date:
 *                 type: string
 *                 description: Дата или ISO timestamp, как в текущем frontend
 *     responses:
 *       200:
 *         description: Отчёт и завершение задачи сохранены
 *       400:
 *         description: Некорректные данные
 *       401:
 *         description: Требуется авторизация
 *       403:
 *         description: Роль не разрешена
 *       404:
 *         description: Задача не найдена или принадлежит другому пользователю
 *       500:
 *         description: Ошибка сервера; транзакция откатывается
 */
router.post("/new", reportController.newReport);

module.exports = router;
