const express = require("express");
const router = express.Router();
const teamController = require("../controllers/teamController");

/**
 * @openapi
 * components:
 *   schemas:
 *     Team:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         name_team:
 *           type: string
 *           example: "Команда разработки"
 *         description_team:
 *           type: string
 *           example: "Основная команда backend-разработчиков"
 *     TeamMember:
 *       type: object
 *       properties:
 *         id_team_name:
 *           type: integer
 *           example: 1
 *         id_user:
 *           type: integer
 *           example: 5
 *     Error:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Ошибка сервера"
 */

/**
 * @openapi
 * /api/teams:
 *   get:
 *     tags: [Teams]
 *     summary: Получить список всех команд
 *     description: Возвращает массив всех команд с их описанием
 *     responses:
 *       200:
 *         description: Успешный ответ
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Team'
 *       500:
 *         description: Внутренняя ошибка сервера
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/", teamController.getAllTeam);

/**
 * @openapi
 * /api/teams/create:
 *   post:
 *     tags: [Teams]
 *     summary: Создать новую команду
 *     description: Создает новую команду с указанным названием и описанием
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nameTeam:
 *                 type: string
 *                 example: "Новая команда"
 *               descriptionTeam:
 *                 type: string
 *                 example: "Описание команды"
 *             required:
 *               - nameTeam
 *               - descriptionTeam
 *     responses:
 *       200:
 *         description: Команда успешно создана
 *       400:
 *         description: Не указано название команды или описание команды
 *       500:
 *         description: Внутренняя ошибка сервера
 */

router.post("/create", teamController.createTeam);

/**
 * @openapi
 * /api/teams/delete/{id}:
 *   delete:
 *     tags: [Teams]
 *     summary: Удалить команду
 *     description: Удаляет команду и всех ее участников
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID команды
 *     responses:
 *       200:
 *         description: Команда успешно удалена
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 team:
 *                   $ref: '#/components/schemas/Team'
 *       404:
 *         description: Команда не найдена
 *       500:
 *         description: Внутренняя ошибка сервера
 */
router.delete("/delete/:id", teamController.delTeam);

/**
 * @openapi
 * /api/teams/edit/{id}:
 *   put:
 *     tags: [Teams]
 *     summary: Редактировать команду
 *     description: Изменяет название и описание команды
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID команды
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               newNameTeam:
 *                 type: string
 *                 example: "Обновленное название"
 *               descriptionTeam:
 *                 type: string
 *                 example: "Новое описание"
 *             required:
 *               - newNameTeam
 *     responses:
 *       200:
 *         description: Команда успешно изменена
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Team'
 *       404:
 *         description: Команда не найдена
 *       500:
 *         description: Внутренняя ошибка сервера
 */
router.put("/edit/:id", teamController.editTeam);

/**
 * @openapi
 * /api/teams/newUserTeam/{id}:
 *   post:
 *     tags: [Teams]
 *     summary: Добавить пользователей в команду
 *     description: Добавляет одного или нескольких пользователей в команду
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID команды
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               usersId:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [1, 2, 3]
 *             required:
 *               - usersId
 *     responses:
 *       200:
 *         description: Пользователи успешно добавлены
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/TeamMember'
 *       400:
 *         description: Не указаны ID пользователей
 *       500:
 *         description: Внутренняя ошибка сервера
 */

router.post("/newUserTeam/:id", teamController.addUserTeam);

/**
 * @openapi
 * /api/teams/view/{id}:
 *   get:
 *     tags: [Teams]
 *     summary: Посмотреть список пользователей в команде
 *     description: Вывод списка пользователей в команде
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID команды
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               usersId:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [1, 2, 3]
 *             required:
 *               - usersId
 *     responses:
 *       200:
 *         description: Пользователи успешно добавлены
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/TeamMember'
 *       400:
 *         description: Не указаны ID пользователей
 *       500:
 *         description: Внутренняя ошибка сервера
 */

router.get("/view/:id", teamController.viewTeam);

router.post("/delUserTeam/:id_team/:id_user", teamController.delUserTeams);

module.exports = router;