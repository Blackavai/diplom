const express = require("express");
const router = express.Router();
const TaskController = require("../controllers/taskController");
const { authenticate, requireManager } = require('../middleware/authMiddleware');
router.use(authenticate, requireManager);

/**
 * @openapi
 * components:
 *   schemas:
 *     Task:
 *       type: object
 *       required: [id, content, id_user, start_date, end_date, status]
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         content:
 *           type: string
 *           minLength: 1
 *           maxLength: 255
 *           example: Подготовить отчёт
 *         id_user:
 *           type: string
 *           description: bigint PostgreSQL сериализуется pg как строка.
 *           example: "5"
 *         start_date:
 *           type: string
 *           format: date-time
 *           description: Прежняя JSON-сериализация DATE через pg/Date; общий date-only контракт вводится отдельно.
 *           example: "2026-11-16T00:00:00.000Z"
 *         end_date:
 *           type: string
 *           format: date-time
 *           example: "2026-11-17T00:00:00.000Z"
 *         status:
 *           type: boolean
 *           example: false
 *     TaskDateInput:
 *       type: string
 *       maxLength: 40
 *       description: Реальная дата YYYY-MM-DD в годах 0001–9999 либо ISO timestamp с T, секундами и Z/смещением до 15:59. Дробные секунды допустимы. Календарная часть передаётся в прежний SQL без пересчёта в UTC. Порядок дат этим этапом не проверяется.
 *       example: "2026-11-17"
 *     TaskRecipientId:
 *       description: Положительный id до 2147483647; поддерживается прежняя каноническая десятичная строка.
 *       oneOf:
 *         - type: integer
 *           minimum: 1
 *           maximum: 2147483647
 *         - type: string
 *           pattern: '^[1-9][0-9]{0,9}$'
 *           maxLength: 10
 *       example: 5
 *     TaskError:
 *       type: object
 *       required: [error]
 *       properties:
 *         error:
 *           type: string
 *           example: Ошибка сервера
 *     TaskServerError:
 *       description: Прежнее поле error контроллера задач; ошибки проверки сессии имеют поле message.
 *       anyOf:
 *         - $ref: '#/components/schemas/TaskError'
 *         - $ref: '#/components/schemas/Error'
 *     Error:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: Ошибка сервера
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
 *       401:
 *         description: Требуется авторизация
 *       403:
 *         description: Требуется роль менеджера
 *       500:
 *         description: Ошибка сервера
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TaskServerError'
 */
router.get("/", TaskController.getAllTasks);

/**
 * @openapi
 * /api/tasks/new:
 *   post:
 *     tags: [Tasks]
 *     summary: Создать новую задачу
 *     description: Только менеджер. Проверка текущего отпуска сохранена; статус новой задачи всегда false. Дополнительные поля игнорируются.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content, id_user, start_date, end_date]
 *             properties:
 *               content:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 255
 *                 description: Непустой текст до 255 Unicode-символов без NUL и одиночных суррогатов; пробелы не обрезаются.
 *               id_user:
 *                 $ref: '#/components/schemas/TaskRecipientId'
 *               start_date:
 *                 $ref: '#/components/schemas/TaskDateInput'
 *               end_date:
 *                 $ref: '#/components/schemas/TaskDateInput'
 *     responses:
 *       200:
 *         description: При checkVacation=false задача создана и task содержит запись; при true сотрудник в отпуске и запись не создаётся.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [message, checkVacation]
 *               properties:
 *                 message:
 *                   type: string
 *                 checkVacation:
 *                   type: boolean
 *                 task:
 *                   $ref: '#/components/schemas/Task'
 *       400:
 *         description: Неверные обязательные поля, типы, идентификатор, текст или дата
 *       401:
 *         description: Требуется авторизация
 *       403:
 *         description: Требуется роль менеджера
 *       404:
 *         description: Сотрудник не найден; JSON с полем message
 *       500:
 *         description: Ошибка сервера
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TaskServerError'
 */
router.post("/new", TaskController.addNewTask);

/**
 * @openapi
 * /api/tasks/update/{id}:
 *   put:
 *     tags: [Tasks]
 *     summary: Обновить задачу
 *     description: Полное обновление content, конечной даты и status. Основное имя даты end_date; прежнее date сохраняется как совместимый alias. Если переданы оба поля, они должны быть валидными и иметь одинаковую календарную часть. Исполнитель и start_date не меняются; дополнительные поля игнорируются.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 2147483647
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content, status]
 *             anyOf:
 *               - required: [end_date]
 *               - required: [date]
 *             properties:
 *               content:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 255
 *                 description: Непустой текст без NUL и одиночных суррогатов; пробелы сохраняются.
 *               end_date:
 *                 $ref: '#/components/schemas/TaskDateInput'
 *               date:
 *                 $ref: '#/components/schemas/TaskDateInput'
 *               status:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Задача обновлена
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 *       400:
 *         description: Неверные или неполные данные; конфликт end_date/date
 *       401:
 *         description: Требуется авторизация
 *       403:
 *         description: Требуется роль менеджера
 *       404:
 *         description: Задача не найдена
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TaskError'
 *       500:
 *         description: Ошибка сервера
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TaskServerError'
 */
router.put("/update/:id", TaskController.updateTaskContent);

/**
 * @openapi
 * /api/tasks/delete/{id}:
 *   delete:
 *     tags: [Tasks]
 *     summary: Удалить задачу
 *     description: Отсутствующая задача получает 404. Прежний QueryResult в успешном ответе и действующие ограничения удаления сохранены; история и каскады этим этапом не менялись.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 2147483647
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
 *                   type: object
 *                   description: Прежний QueryResult PostgreSQL; дополнительные поля драйвера сохраняются.
 *                   properties:
 *                     command:
 *                       type: string
 *                       example: DELETE
 *                     rowCount:
 *                       type: integer
 *                       example: 1
 *       400:
 *         description: Некорректный id
 *       401:
 *         description: Требуется авторизация
 *       403:
 *         description: Требуется роль менеджера
 *       404:
 *         description: Задача не найдена
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TaskError'
 *       500:
 *         description: Ошибка сервера; прежний отказ удаления зависимой задачи сохранён
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TaskServerError'
 */
router.delete("/delete/:id", TaskController.deleteTask);

module.exports = router;
