const express = require("express");
const router = express.Router();
const UserController = require("../controllers/userController");

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
router.get("/", UserController.getAllUsers);

/**
 * @openapi
 * /api/users/update/{id}:
 *   post:
 *     tags: [Users]
 *     summary: Обновить информацию о пользователе
 *     description: Обновляет имя, фамилию и должность пользователя по его ID
 *     parameters:
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
 *               fname:
 *                 type: string
 *                 example: "Иван"
 *               lname:
 *                 type: string
 *                 example: "Иванов"
 *               post:
 *                 type: string
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
 *       500:
 *         description: Внутренняя ошибка сервера
 */
router.post("/update/:id", UserController.updateUserInfo);

/**
 * @openapi
 * /api/users/delete/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Удалить пользователя
 *     description: Удаляет пользователя по его ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID пользователя
 *     responses:
 *       201:
 *         description: Пользователь успешно удалён
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       500:
 *         description: Внутренняя ошибка сервера
 */
router.get("/delete/:id", UserController.deleteUser);

/**
 * @openapi
 * /api/users/vacation/{id}:
 *   post:
 *     tags: [Users]
 *     summary: Создать отпуск для пользователя
 *     description: Добавляет отпуск для пользователя по его ID
 *     parameters:
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
 *                     id_user:
 *                       type: integer
 *                     start_holiday:
 *                       type: string
 *                       format: date
 *                       example: "2025-05-10"
 *                     end_holiday:
 *                       type: string
 *                       format: date
 *                       example: "2025-06-01"
 *       500:
 *         description: Внутренняя ошибка сервера
 */
router.post("/vacation/:id", UserController.vacationUser);

router.get("/vacation/view", UserController.allVacationUser);

router.get("/:id/team", UserController.checkTeam);
router.get("/:id/tasks", UserController.checkCountTasks);
router.get("/:id/vacation", UserController.checkVacation);

module.exports = router;