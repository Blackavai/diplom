const AuthModel = require("../models/authModel");
const jwt = require("jsonwebtoken");
const { randomBytes } = require('node:crypto');
const { positiveId } = require('../middleware/authMiddleware');
const { setSessionCookie, csrfToken, isBrowserLoginAllowed } = require('../utils/sessionCookies');
const { isValidUserText, isValidUserAccount } = require('../utils/userValidation');
const { isNonEmptyString } = require('../utils/passwordRecovery');
const { hashPassword, verifyPassword, isValidPassword, legacyLoginAllowed } = require('../utils/passwords');
const { loginAttempts, passwordAttempts } = require('../utils/loginAttempts');

const invalidCredentials = (res) => res.status(400).json({ message: 'Неверный логин или пароль' });
function authFailure(res, error) {
    if (error?.code === 'PASSWORD_HASH_BUSY') {
        res.set('Retry-After', '1');
        return res.status(503).json({ message: 'Сервер занят. Повторите позже.' });
    }
    if (error?.code === '23505' && error.constraint === 'users_tg_id_unique') {
        return res.status(409).json({ message: 'Пользователь с таким id уже существует.' });
    }
    console.error('Ошибка операции с учётными данными');
    return res.status(500).json({ message: 'Ошибка сервера' });
}

function validatePasswordRequest(req, res) {
    res.set('Cache-Control', 'no-store');
    if (!passwordAttempts.allowAttempt(String(req.user.id), req.ip || req.socket?.remoteAddress || 'unknown')) {
        res.set('Retry-After', '900');
        res.status(429).json({ message: 'Слишком много попыток. Повторите позже.' });
        return false;
    }
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    if (!isValidPassword(currentPassword) || !isValidPassword(newPassword) || newPassword !== confirmPassword) {
        res.status(400).json({ message: 'Заполните текущий и новый пароль; подтверждение должно совпадать' });
        return false;
    }
    return true;
}

const AuthController = {
    insertNewUser: async (req, res) => {
        res.set('Cache-Control', 'no-store');
        try {
            const { fname, lname, tg_id, post, role, pass } = req.body || {};
            if (!isValidPassword(pass)) return res.status(400).json({ message: 'Введите пароль' });
            if (!isValidUserText(fname) || !isValidUserText(lname) || !isValidUserText(post)) {
                return res.status(400).json({ message: 'Имя, фамилия и должность должны быть непустыми строками до 255 символов' });
            }
            if (!isValidUserAccount(tg_id)) return res.status(400).json({ message: 'Введите корректный Telegram ID длиной до 255' });
            if (role !== 1 && role !== 2) return res.status(400).json({ message: 'Выберите роль: менеджер или работник' });
            const existingUser = await AuthModel.findUserByTGid(tg_id);
            if (existingUser) {
                return res.status(409).json({ message: "Пользователь с таким id уже существует." });
            }
            const hash = await hashPassword(pass);
            const newUser = await AuthModel.createUser(fname, lname, tg_id, post, role, hash);
            const { id, fname: firstName, lname: lastName, tg_id: account, post: position, role: userRole } = newUser;
            return res.status(201).json({ message: "Пользователь успешно зарегистрирован", user: {
                id, fname: firstName, lname: lastName, tg_id: account, post: position, role: userRole
            } });
        } catch (err) {
            return authFailure(res, err);
        }
    },

    deleteUser: async (req, res) => {
        res.locals.errorOperation = 'Ошибка удаления сотрудника';
        const id = positiveId(req.params.id);
        if (id === null) return res.status(400).json({ message: 'Некорректный идентификатор' });
        let delUser;
        try { delUser = await AuthModel.delUser(id); }
        catch (error) {
            if (error.code === 'DELETE_HAS_DEPENDENCIES' || error.code === '23503') return res.status(409).json({ message: 'Сотрудник связан с задачами, отчётами, отпусками или командами и не может быть удалён' });
            throw error;
        }
        if (!delUser.rowCount) return res.status(404).json({ message: 'Пользователь не найден' });
        return res.status(201).json({ message: "Пользователь успешно удалён" });
    },

    loginUser: async (req, res) => {
        res.set('Cache-Control', 'no-store');
        const bearerLogin = req.get('X-Auth-Mode') === 'bearer';
        // Выдача Bearer предназначена для явных небраузерных API-клиентов.
        if (bearerLogin ? Boolean(req.get('Origin') || req.get('Sec-Fetch-Site')) : !isBrowserLoginAllowed(req)) {
            return res.status(403).json({ message: 'Не удалось подтвердить запрос входа' });
        }
        try {
            const { tg_id, password } = req.body || {};
            const validAccount = isNonEmptyString(tg_id);
            if (!loginAttempts.allowAttempt(validAccount ? tg_id : null, req.ip || req.socket?.remoteAddress || 'unknown')) {
                res.set('Retry-After', '900');
                return res.status(429).json({ message: 'Слишком много попыток входа. Повторите позже.' });
            }
            if (!validAccount || !isValidPassword(password)) return invalidCredentials(res);
            const user = await AuthModel.findUserByTGid(tg_id);
            const result = await verifyPassword(password, user?.password, { allowLegacy: legacyLoginAllowed() });
            if (!user || !result.matches) return invalidCredentials(res);
            if (result.needsUpgrade) {
                if (!legacyLoginAllowed()) return invalidCredentials(res);
                const hash = await hashPassword(password);
                if (!legacyLoginAllowed()) return invalidCredentials(res);
                if (!await AuthModel.upgradePassword(user.id, user.password, hash)) {
                    // Another login or reset may have changed the credential while hashing.
                    const current = await AuthModel.findPasswordById(user.id);
                    if (!(await verifyPassword(password, current?.password)).matches) return invalidCredentials(res);
                }
            }

            // Используем версию, прочитанную вместе с проверяемым паролем.
            // Одновременный reset сделает такой JWT недействительным.
            if (!Number.isInteger(user.session_version) || user.session_version < 0) throw new Error('Invalid session version');
            const token = jwt.sign({ id: user.id, sessionVersion: user.session_version, jti: randomBytes(16).toString('hex') }, process.env.JWT_SECRET, { expiresIn: '1h' });
            if (!bearerLogin) setSessionCookie(res, token);

            return res.status(200).json({ message: "Вы вошли в систему",
                user: {
                    id: user.id,
                    fname: user.fname,
                    lname: user.lname,
                    tg_id: user.tg_id,
                    post: user.post,
                    role: user.role,
                    passwordChangeRecommended: user.password_change_recommended === true,
                    ...(bearerLogin ? { token } : {})
                } });
        } catch (err) {
            return authFailure(res, err);
        }
    },
    logout: async (req, res) => {
        try {
            await AuthModel.revokeSessions(req.user.id, req.user.session_version);
            // Не посылаем очистку cookie: поздний ответ не должен стереть новый вход.
            // Оставшаяся HttpOnly-cookie уже недействительна из-за версии сессии.
            return res.status(200).json({ message: 'Все сессии завершены', success: true });
        } catch (error) {
            return authFailure(res, error);
        }
    },
    protected: async (req, res) => {
        const { id, fname, lname, tg_id, post, role } = req.user;
        return res.json({ message: 'Доступ разрешен', user: { id, fname, lname, tg_id, post, role,
            passwordChangeRecommended: req.user.password_change_recommended === true },
            ...(req.authMode === 'cookie' ? { sessionId: req.sessionId, csrfToken: csrfToken(req.authToken) } : {}) });
    },

    changePassword: async (req, res) => {
        if (!validatePasswordRequest(req, res)) return;
        try {
            const { currentPassword, newPassword } = req.body;
            if (currentPassword === newPassword) return res.status(400).json({ message: 'Новый пароль должен отличаться от текущего' });
            const credentials = await AuthModel.findCredentialsById(req.user.id);
            if (!credentials || credentials.session_version !== req.user.session_version ||
                !(await verifyPassword(currentPassword, credentials.password)).matches) {
                return res.status(403).json({ message: 'Текущий пароль не подтверждён' });
            }
            const hash = await hashPassword(newPassword);
            if (!await AuthModel.changeOwnPassword(credentials, hash)) {
                return res.status(409).json({ message: 'Данные доступа изменились. Повторите вход.' });
            }
            return res.status(200).json({ message: 'Пароль изменён. Войдите с новым паролем.', success: true });
        } catch (error) {
            return authFailure(res, error);
        }
    },
    resetPassword: async (req, res) => {
        if (!validatePasswordRequest(req, res)) return;
        const id = positiveId(req.params.id);
        if (id === null) return res.status(400).json({ message: 'Некорректный идентификатор' });
        if (id === req.user.id) return res.status(400).json({ message: 'Свой пароль измените через форму смены пароля' });
        try {
            const { currentPassword, newPassword } = req.body;
            const manager = await AuthModel.findCredentialsById(req.user.id);
            const target = await AuthModel.findCredentialsById(id);
            if (!manager || manager.role !== 1 || manager.session_version !== req.user.session_version ||
                !(await verifyPassword(currentPassword, manager.password)).matches) {
                return res.status(403).json({ message: 'Пароль менеджера не подтверждён' });
            }
            const hash = await hashPassword(newPassword);
            if (!target) return res.status(404).json({ message: 'Пользователь не найден' });
            await AuthModel.resetUserPassword(manager, target, hash);
            return res.status(200).json({ message: 'Новый пароль установлен. Передайте его сотруднику лично.', success: true });
        } catch (error) {
            if (error.code === 'CREDENTIALS_CHANGED') return res.status(409).json({ message: 'Данные доступа изменились. Проверьте состояние пользователя и повторите вход.' });
            return authFailure(res, error);
        }
    },
    recoveryUnavailable: async (req, res) => {
        res.set('Cache-Control', 'no-store');
        return res.status(410).json({ message: 'Восстановление по секретному вопросу отключено. Обратитесь к менеджеру.' });
    }
};

module.exports = AuthController;
