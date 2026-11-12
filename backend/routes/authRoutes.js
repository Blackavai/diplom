const express = require("express");
const router = express.Router();
const AuthController = require("../controllers/authController");
const { authenticate, requireManager } = require('../middleware/authMiddleware');

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Authorization]
 *     security: []
 *     summary: Вход пользователя
 *     description: Проверяет пароль через scrypt; временный вход со старым паролем разрешён только до явно заданного LEGACY_PASSWORD_LOGIN_UNTIL и преобразует запись условным UPDATE. Новых ограничений длины нет, действует существующий лимит JSON. На аккаунт 10 запросов, на IP 60 запросов за 15 минут, включая успешные входы.
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
 *         description: Единое сообщение о неверном логине или пароле
 *       429:
 *         description: Лимит попыток входа, Retry-After 900 секунд
 *       503:
 *         description: Очередь scrypt заполнена, Retry-After 1 секунда
 *       500:
 *         description: Внутренняя ошибка сервера
 */

/**
 * @openapi
 * /api/auth/recPass:
 *   post:
 *     tags: [Authorization]
 *     security: []
 *     summary: Получить проверочный вопрос
 *     description: Возвращает только вопрос. Для пустых или неоднозначных учётных записей восстановление недоступно.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tg_id]
 *             properties:
 *               tg_id:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 255
 *     responses:
 *       200:
 *         description: Проверочный вопрос, без секретного ответа
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
 *       400:
 *         description: Некорректный запрос
 *       403:
 *         description: Восстановление недоступно
 *       429:
 *         description: Лимит всех запросов восстановления за 15 минут — 15 на аккаунт и 60 на IP
 *       500:
 *         description: Внутренняя ошибка сервера
 * /api/auth/recAns:
 *   post:
 *     tags: [Authorization]
 *     security: []
 *     summary: Подтвердить ответ и получить одноразовое разрешение
 *     description: Новое разрешение отменяет предыдущее для этого пользователя. Секретный ответ не возвращается.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tg_id, secAns]
 *             properties:
 *               tg_id:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 255
 *               secAns:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 255
 *     responses:
 *       200:
 *         description: Разрешение на смену пароля сроком 5 минут
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 recoveryToken:
 *                   type: string
 *                   pattern: '^[a-f0-9]{64}$'
 *                 expiresIn:
 *                   type: integer
 *                   enum: [300]
 *       400:
 *         description: Некорректный запрос или пустой ответ
 *       403:
 *         description: Неверный ответ или восстановление недоступно
 *       429:
 *         description: Слишком много запросов восстановления
 *       503:
 *         description: Хранилище разрешений временно недоступно
 *       500:
 *         description: Внутренняя ошибка сервера
 * /api/auth/recPass/newPass:
 *   post:
 *     tags: [Authorization]
 *     security: []
 *     summary: Установить новый пароль по одноразовому разрешению
 *     description: Разрешение привязано к пользователю, действует 5 минут и расходуется до записи в БД. После ошибки записи требуется повторное подтверждение. Перезапуск backend отменяет разрешения. Новый пароль сохраняется как scrypt-хеш без ограничения длины в символах; действует лимит JSON-запроса. Ранее выданные JWT не отзываются.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tg_id, textNewPassword, recoveryToken]
 *             properties:
 *               tg_id:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 255
 *               textNewPassword:
 *                 type: string
 *                 minLength: 1
 *               recoveryToken:
 *                 type: string
 *                 pattern: '^[a-f0-9]{64}$'
 *     responses:
 *       200:
 *         description: Пароль изменён; пароль и данные пользователя не возвращаются
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Некорректный запрос или пустой пароль
 *       403:
 *         description: Отсутствующее, чужое, использованное или просроченное разрешение
 *       429:
 *         description: Слишком много запросов восстановления
 *       500:
 *         description: Ошибка сервера; требуется повторное подтверждение восстановления
 */

/**
 * @openapi
 * /api/auth/protected:
 *   get:
 *     tags: [Authorization]
 *     summary: Получить текущего пользователя по Bearer JWT
 *     description: Проверяет HS256, срок действия, существование пользователя и актуальную роль в БД. Пароль и секретный ответ не возвращаются.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Безопасные поля пользователя в объекте user
 *       401:
 *         description: Нет Bearer JWT, неверный токен или пользователь отсутствует
 *       403:
 *         description: Роль пользователя не разрешена
 *       500:
 *         description: Ошибка сервера
 */

router.post("/createUser", authenticate, requireManager, AuthController.insertNewUser);
router.delete("/delUser/:id", authenticate, requireManager, AuthController.deleteUser);
router.post("/login", AuthController.loginUser);
router.get("/protected", authenticate, AuthController.protected);
router.post("/recPass", AuthController.recPass);
router.post("/recAns", AuthController.recAns);
router.post("/recPass/newPass", AuthController.newPass);

module.exports = router;