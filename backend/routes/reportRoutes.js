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
 *       - $ref: '#/components/parameters/SessionIdHeader'
 *       - $ref: '#/components/parameters/CsrfHeader'
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
 *       400:
 *         description: Некорректный положительный id
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
 *     description: Доступно обеим ролям. Автор определяется по проверенной сессии; body.id_user игнорируется. Проверка исполнителя, вставка отчёта и завершение задачи атомарны. Новый отчёт допускается только по незавершённой задаче. После повторного открытия менеджером возможен следующий отчёт; история сохраняется.
 *     parameters:
 *       - $ref: '#/components/parameters/SessionIdHeader'
 *       - $ref: '#/components/parameters/CsrfHeader'
 *       - in: header
 *         name: Idempotency-Key
 *         description: UUID операции, обязателен для cookie. Повтор с теми же данными возвращает прежний успех; изменённые данные — 409. Для прежних Bearer-клиентов необязателен.
 *         schema: { type: string, format: uuid }
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
 *                 maximum: 2147483647
 *               text_report:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 255
 *                 description: Непустой текст до 255 Unicode-символов; NUL и одиночные суррогаты запрещены. Пробелы и содержимое сохраняются без нормализации.
 *               end_date:
 *                 type: string
 *                 maxLength: 40
 *                 description: Реальная дата YYYY-MM-DD (годы 0001–9999) или ISO timestamp с T, секундами и Z либо смещением ±HH:MM до 15:59. Необязательная дробная часть секунд поддерживается. Сохраняется календарная часть даты без пересчёта в UTC, как в действующем API.
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
 *       409:
 *         description: Задача уже завершена или ключ использован с другими данными
 *       500:
 *         description: Ошибка сервера; транзакция откатывается
 */
router.post("/new", reportController.newReport);

module.exports = router;
