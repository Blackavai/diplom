const express = require("express");
const router = express.Router();
const AuthController = require("../controllers/authController");

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Authorization]
 *     summary: Вход пользователя
 *     description: Позволяет пользователю войти в систему
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tg_id:
 *                 type: string
 *                 example: "123456789"
 *               password:
 *                 type: string
 *                 example: "securePassword123"
 *             required:
 *               - tg_id
 *               - password
 *     responses:
 *       200:
 *         description: Успешный вход
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
 *                     fname:
 *                       type: string
 *                     lname:
 *                       type: string
 *                     tg_id:
 *                       type: string
 *                     post:
 *                       type: string
 *                     token:
 *                       type: string
 *       400:
 *         description: Пользователь не найден или неверный пароль
 *       500:
 *         description: Внутренняя ошибка сервера
 */

/**
 * @openapi
 * /api/auth/recPass:
 *   get:
 *     tags: [Authorization]
 *     summary: Восстановление пароля
 *     description: Получение вопросов и ответов для восстановления пароля
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tg_id:
 *                 type: string
 *                 example: "123456789"
 *             required:
 *               - tg_id
 *     responses:
 *       200:
 *         description: Вопросы для восстановления пароля
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 recoverPassword:
 *                   type: object
 *                   properties:
 *                     questions:
 *                       type: string
 *                     answers:
 *                       type: string
 *       404:
 *         description: Пользователь не найден
 *       500:
 *         description: Внутренняя ошибка сервера
 */

/**
 * @openapi
 * /api/auth/recPass/newPass:
 *   post:
 *     tags: [Authorization]
 *     summary: Установка нового пароля
 *     description: Устанавливает новый пароль для пользователя
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tg_id:
 *                 type: string
 *                 example: "123456789"
 *               textNewPassword:
 *                 type: string
*                 example: "newSecurePassword123"
*             required:
*               - tg_id
*               - textNewPassword
*     responses:
*       200:
*         description: Пароль успешно изменён
*         content:
*           application/json:
*             schema:
    *               type: object
*               properties:
*                 message:
    *                   type: string
*                 pass:
*                   type: object
*                   properties:
*                     tg_id:
    *                       type: string
*                     password:
*                       type: string
*       404:
*         description: Пользователь не найден
*       500:
*         description: Внутренняя ошибка сервера
*/


router.post("/createUser", AuthController.insertNewUser);
router.delete("/delUser/:id", AuthController.deleteUser);
router.post("/login", AuthController.loginUser);
router.get("/protected", AuthController.protected);
router.post("/recPass", AuthController.recPass);
router.post("/recAns", AuthController.recAns);
router.post("/recPass/newPass", AuthController.newPass);

module.exports = router;