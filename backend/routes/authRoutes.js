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
 *     parameters:
 *       - in: header
 *         name: X-Requested-With
 *         description: Для браузерного входа — XMLHttpRequest; устанавливается HttpOnly-cookie без JWT в JSON
 *         schema: { type: string, enum: [XMLHttpRequest] }
 *       - in: header
 *         name: X-Auth-Mode
 *         description: Явный небраузерный вход; при Origin или Sec-Fetch-Site отклоняется
 *         schema: { type: string, enum: [bearer] }
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
 *                       description: Только при явном небраузерном Bearer-входе
 *       400:
 *         description: Единое сообщение о неверном логине или пароле
 *       403:
 *         description: Не подтверждён режим входа
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
 *     description: Разрешение привязано к пользователю, действует 5 минут и расходуется до записи в БД. После ошибки записи требуется повторное подтверждение. Перезапуск backend отменяет разрешения. Новый пароль сохраняется как scrypt-хеш без ограничения длины в символах; действует лимит JSON-запроса. Пароль и версия сессий обновляются атомарно; прежние JWT отзываются.
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
 *     summary: Получить текущего пользователя по проверенной сессии
 *     description: Проверяет HS256, срок действия, существование пользователя, актуальную роль и sessionVersion в БД. JWT без версии больше не принимается. Пароль и секретный ответ не возвращаются.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Безопасные поля пользователя в объекте user; для cookie также sessionId и csrfToken, без JWT
 *       401:
 *         description: Нет действительной сессии или пользователь отсутствует
 *       403:
 *         description: Роль пользователя не разрешена
 *       500:
 *         description: Ошибка сервера
 */

/**
 * @openapi
 * /api/auth/createUser:
 *   post:
 *     tags: [Authorization]
 *     summary: Создать сотрудника (менеджер)
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     description: Проверяет поля до SQL и возвращает только безопасные данные. Пароль сохраняется как scrypt без новых правил длины. После применения migrate-integrity.js уникальность tg_id закреплена БД; конкурентный конфликт возвращает 409.
 *     parameters:
 *       - $ref: '#/components/parameters/SessionIdHeader'
 *       - $ref: '#/components/parameters/CsrfHeader'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fname, lname, tg_id, post, role, pass]
 *             properties:
 *               fname:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 255
 *               lname:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 255
 *               post:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 255
 *               tg_id:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 255
 *                 description: Непустой идентификатор до 255 UTF-16 единиц для совместимости с действующим входом; значение не обрезается и не нормализуется.
 *               role:
 *                 type: integer
 *                 enum: [1, 2]
 *               pass:
 *                 type: string
 *                 writeOnly: true
 *                 description: Непустой пароль; сохраняется целиком без обрезания и нормализации.
 *     responses:
 *       201:
 *         description: Пользователь создан; user содержит только id, fname, lname, tg_id, post, role
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   type: object
 *                   required: [id, fname, lname, tg_id, post, role]
 *                   properties:
 *                     id:
 *                       type: integer
 *                     fname:
 *                       type: string
 *                     lname:
 *                       type: string
 *                     tg_id:
 *                       type: string
 *                     post:
 *                       type: string
 *                     role:
 *                       type: integer
 *       400:
 *         description: Некорректные поля, роль или пароль
 *       401:
 *         description: Требуется действующая сессия
 *       403:
 *         description: Доступно только менеджеру
 *       409:
 *         description: Пользователь с таким tg_id уже существует
 *       503:
 *         description: Очередь хеширования заполнена
 *       500:
 *         description: Безопасная ошибка сервера
 */
router.post("/createUser", authenticate, requireManager, AuthController.insertNewUser);
/**
 * @openapi
 * /api/auth/delUser/{id}:
 *   delete:
 *     tags: [Authorization]
 *     summary: Удалить сотрудника (менеджер)
 *     parameters:
 *       - $ref: '#/components/parameters/SessionIdHeader'
 *       - $ref: '#/components/parameters/CsrfHeader'
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1, maximum: 2147483647 }
 *     responses:
 *       201:
 *         description: Пользователь удалён
 *       400:
 *         description: Некорректный идентификатор
 *       404:
 *         description: Пользователь не найден
 *       409:
 *         description: Сотрудник связан с задачами, отчётами, отпусками или командами; данные сохранены
 *       500:
 *         description: Безопасная ошибка, включая отказ зависимостей; политика истории остаётся отдельным этапом
 */
router.delete("/delUser/:id", authenticate, requireManager, AuthController.deleteUser);
/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags: [Authorization]
 *     summary: Завершить все сессии текущего пользователя
 *     description: Требует проверенную сессию с актуальной sessionVersion. Для cookie нужны X-Session-Id и X-CSRF-Token. Увеличивает версию в БД; все прежние JWT отклоняются. HttpOnly-cookie остаётся до срока истечения, но уже недействительна; поздний ответ выхода не перезаписывает новый вход. Уже начатые операции не отменяются.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/SessionIdHeader'
 *       - $ref: '#/components/parameters/CsrfHeader'
 *     responses:
 *       200:
 *         description: Все прежние сессии завершены
 *       401:
 *         description: Сессия уже недействительна
 *       403:
 *         description: Роль не разрешена
 *       500:
 *         description: Отзыв не подтверждён, безопасная ошибка сервера
 */
router.post("/logout", authenticate, AuthController.logout);
router.post("/login", AuthController.loginUser);
router.get("/protected", authenticate, AuthController.protected);
router.post("/recPass", AuthController.recPass);
router.post("/recAns", AuthController.recAns);
router.post("/recPass/newPass", AuthController.newPass);

module.exports = router;
