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
 *                     passwordChangeRecommended:
 *                       type: boolean
 *                       description: Рекомендация сменить выданный менеджером пароль; доступ не ограничивает
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
 *     summary: Устаревшее восстановление отключено; обратитесь к менеджеру
 *     deprecated: true
 *     security: []
 *     responses:
 *       410:
 *         description: Восстановление по вопросу больше недоступно; пароль не изменяется
 */

/**
 * @openapi
 * /api/auth/recAns:
 *   post:
 *     summary: Устаревшее восстановление отключено; обратитесь к менеджеру
 *     deprecated: true
 *     security: []
 *     responses:
 *       410:
 *         description: Восстановление по вопросу больше недоступно; пароль не изменяется
 */

/**
 * @openapi
 * /api/auth/recPass/newPass:
 *   post:
 *     summary: Устаревшее восстановление отключено; обратитесь к менеджеру
 *     deprecated: true
 *     security: []
 *     responses:
 *       410:
 *         description: Восстановление по вопросу больше недоступно; пароль не изменяется
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
/**
 * @openapi
 * /api/auth/change-password:
 *   post:
 *     summary: Сменить собственный пароль и отозвать прежние сессии
 *     parameters:
 *       - $ref: '#/components/parameters/SessionIdHeader'
 *       - $ref: '#/components/parameters/CsrfHeader'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword, confirmPassword]
 *             properties:
 *               currentPassword: { type: string, format: password }
 *               newPassword: { type: string, format: password }
 *               confirmPassword: { type: string, format: password }
 *     responses:
 *       200: { description: Пароль изменён; необходим повторный вход }
 *       400: { description: Неверные поля или новый пароль совпадает с текущим }
 *       401: { description: Недействительная сессия }
 *       403: { description: Текущий пароль или CSRF не подтверждён }
 *       409: { description: Проверенные данные доступа изменились }
 *       429: { description: Превышено число попыток }
 *       503: { description: Очередь scrypt заполнена }
 * /api/auth/users/{id}/reset-password:
 *   post:
 *     summary: Менеджер задаёт новый пароль другому пользователю
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1, maximum: 2147483647 }
 *       - $ref: '#/components/parameters/SessionIdHeader'
 *       - $ref: '#/components/parameters/CsrfHeader'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword, confirmPassword]
 *             properties:
 *               currentPassword: { type: string, format: password, description: Текущий пароль менеджера }
 *               newPassword: { type: string, format: password }
 *               confirmPassword: { type: string, format: password }
 *     responses:
 *       200: { description: Пароль установлен, прежние сессии отозваны }
 *       400: { description: Неверные поля или попытка сбросить собственный пароль }
 *       401: { description: Недействительная сессия }
 *       403: { description: Недостаточно прав, неверный пароль менеджера или CSRF }
 *       404: { description: Пользователь не найден }
 *       409: { description: Проверенные данные доступа изменились }
 *       429: { description: Превышено число попыток }
 *       503: { description: Очередь scrypt заполнена }
 */
router.post('/change-password', authenticate, AuthController.changePassword);
router.post('/users/:id/reset-password', authenticate, requireManager, AuthController.resetPassword);
router.post("/logout", authenticate, AuthController.logout);
router.post("/login", AuthController.loginUser);
router.get("/protected", authenticate, AuthController.protected);
router.post("/recPass", AuthController.recoveryUnavailable);
router.post("/recAns", AuthController.recoveryUnavailable);
router.post("/recPass/newPass", AuthController.recoveryUnavailable);

module.exports = router;
