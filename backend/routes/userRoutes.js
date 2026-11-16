const express = require("express");
const router = express.Router();
const UserController = require("../controllers/userController");
const { authenticate, requireManager, requireSelfOrManager } = require('../middleware/authMiddleware');
router.use(authenticate);

/**
 * @openapi
 * /api/users:
 *   get:
 *     tags: [Users]
 *     summary: Получить всех пользователей
 *     description: Возвращает список всех пользователей
 *     responses:
 *       200:
 *         description: Список пользователей успешно получен
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     example: "1"
 *                   fname:
 *                     type: string
 *                     example: "Имя сотрудника"
 *                   lname:
 *                     type: string
 *                     example: "Фамилия сотрудника"
 *                   tg_id:
 *                     type: string
 *                     example: "ID телеграмма"
 *                   post:
 *                     type: string
 *                     example: "Должность"
 *       500:
 *         description: Внутренняя ошибка сервера
 */
router.get("/", requireManager, UserController.getAllUsers);

/**
 * @openapi
 * /api/users/update/{id}:
 *   post:
 *     tags: [Users]
 *     summary: Обновить информацию о пользователе
 *     description: Обновляет имя, фамилию и должность пользователя по его ID
 *     parameters:
 *       - $ref: '#/components/parameters/SessionIdHeader'
 *       - $ref: '#/components/parameters/CsrfHeader'
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 2147483647
 *         description: ID пользователя
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fname:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 255
 *                 example: "Иван"
 *               lname:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 255
 *                 example: "Иванов"
 *               post:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 255
 *                 example: "Менеджер"
 *             required:
 *               - fname
 *               - lname
 *               - post
 *     responses:
 *       201:
 *         description: Информация о пользователе успешно обновлена
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     fname:
 *                       type: string
 *                       example: "Новое имя"
 *                     lname:
 *                       type: string
 *                       example: "Новая фамилия"
 *                     post:
 *                       type: string
 *                       example: "Новая должность"
 *       400:
 *         description: Некорректные id или непустые строки до 255 Unicode-символов
 *       404:
 *         description: Пользователь не найден
 *       500:
 *         description: Внутренняя ошибка сервера
 */
router.post("/update/:id", requireManager, UserController.updateUserInfo);

/**
 * @openapi
 * /api/users/delete/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Старый GET удаления отключён
 *     deprecated: true
 *     description: Никогда не удаляет данные. Используйте DELETE по этому пути либо /api/auth/delUser/{id}.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       405:
 *         description: Метод отключён, Allow DELETE
 *   delete:
 *     tags: [Users]
 *     summary: Удалить сотрудника без зависимых данных
 *     parameters:
 *       - $ref: '#/components/parameters/SessionIdHeader'
 *       - $ref: '#/components/parameters/CsrfHeader'
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1, maximum: 2147483647 }
 *     responses:
 *       201:
 *         description: Сотрудник удалён
 *       400:
 *         description: Некорректный id
 *       404:
 *         description: Сотрудник не найден
 *       409:
 *         description: Есть связанные задачи, отчёты, отпуска или команды; все записи сохранены
 *       500:
 *         description: Безопасная техническая ошибка
 */
router.get("/delete/:id", requireManager, (req, res) => {
    res.set('Allow', 'DELETE').status(405).json({ message: 'Для удаления используйте DELETE' });
});
router.delete("/delete/:id", requireManager, UserController.deleteUser);

/**
 * @openapi
 * /api/users/vacation/{id}:
 *   post:
 *     tags: [Users]
 *     summary: Создать отпуск для пользователя
 *     description: Проверяет положительный id, существование сотрудника и реальные YYYY-MM-DD/ISO даты. Начало не позже окончания; календарные ответы YYYY-MM-DD, текущий день определяется по Europe/Moscow. Возвращает сохранённую запись
 *     parameters:
 *       - $ref: '#/components/parameters/SessionIdHeader'
 *       - $ref: '#/components/parameters/CsrfHeader'
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID пользователя
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startHoliday:
 *                 type: string
 *                 format: date
 *                 example: "2025-05-10"
 *               endHoliday:
 *                 type: string
 *                 format: date
 *                 example: "2025-06-01"
 *             required:
 *               - startHoliday
 *               - endHoliday
 *     responses:
 *       201:
 *         description: Отпуск успешно создан
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     id_user:
 *                       type: string
 *                     start_holiday:
 *                       type: string
 *                       format: date
 *                       example: "2025-05-10"
 *                     end_holiday:
 *                       type: string
 *                       format: date
 *                       example: "2025-06-01"
 *       400:
 *         description: Некорректные id или даты
 *       404:
 *         description: Пользователь не найден
 *       500:
 *         description: Внутренняя ошибка сервера
 */
router.post("/vacation/:id", requireManager, UserController.vacationUser);

router.get("/vacation/view", requireManager, UserController.allVacationUser);

router.get("/:id/team", requireSelfOrManager, UserController.checkTeam);
router.get("/:id/tasks", requireSelfOrManager, UserController.checkCountTasks);
router.get("/:id/vacation", requireSelfOrManager, UserController.checkVacation);

module.exports = router;