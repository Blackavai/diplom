const AuthModel = require("../models/authModel");
const jwt = require("jsonwebtoken");
const { recovery, isNonEmptyString } = require('../utils/passwordRecovery');
const { hashPassword, verifyPassword, isValidPassword, legacyLoginAllowed } = require('../utils/passwords');
const { loginAttempts } = require('../utils/loginAttempts');

const invalidCredentials = (res) => res.status(400).json({ message: 'Неверный логин или пароль' });
function authFailure(res, error) {
    if (error?.code === 'PASSWORD_HASH_BUSY') {
        res.set('Retry-After', '1');
        return res.status(503).json({ message: 'Сервер занят. Повторите позже.' });
    }
    console.error('Ошибка операции с учётными данными');
    return res.status(500).json({ message: 'Ошибка сервера' });
}

function validateRecoveryRequest(req, res) {
    res.set('Cache-Control', 'no-store');
    if (!isNonEmptyString(req.body?.tg_id)) {
        res.status(400).json({ message: 'Некорректные данные восстановления' });
        return false;
    }
    if (!recovery.allowAttempt(req.body.tg_id, req.ip || req.socket?.remoteAddress || 'unknown')) {
        res.set('Retry-After', '900');
        res.status(429).json({ message: 'Слишком много попыток. Повторите позже.' });
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
            const existingUser = await AuthModel.findUserByTGid(tg_id);
            if (existingUser) {
                return res.status(400).json({ message: "Пользователь с таким id уже существует." });
            }
            const hash = await hashPassword(pass);
            const newUser = await AuthModel.createUser(fname, lname, tg_id, post, role, hash);
            return res.status(201).json({ message: "Пользователь успешно зарегистрирован", user: newUser });
        } catch (err) {
            return authFailure(res, err);
        }
    },

    deleteUser: async (req, res) => {
        const { id } = req.params;
        try {
            const delUser = await AuthModel.delUser(id);
            return res.status(201).json({ message: "Пользователь успешно удалён" });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Ошибка сервера" });
        }
    },

    loginUser: async (req, res) => {
        res.set('Cache-Control', 'no-store');
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

            const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

            // Устанавливаем токен в куки
            res.cookie('token', token, {
                httpOnly: false, // Защищает куки от доступа через JavaScript
                secure: false, // Используйте secure в продакшене
                maxAge: 3600000 // Время жизни куки (1 час)
            });

            // Сохраняем данные пользователя в куки
            res.cookie('userData', JSON.stringify({
                id: user.id,
                fname: user.fname,
                lname: user.lname,
                tg_id: user.tg_id,
                post: user.post,
                role: user.role
            }), {
                httpOnly: false, // Защита от доступа через JavaScript
                secure: false, // Используйте secure в продакшене
                maxAge: 3600000 // Время жизни куки (1 час)
            });

            return res.status(200).json({ message: "Вы вошли в систему",
                user: {
                    id: user.id,
                    fname: user.fname,
                    lname: user.lname,
                    tg_id: user.tg_id,
                    post: user.post,
                    role: user.role,
                    token: token
                } });
        } catch (err) {
            return authFailure(res, err);
        }
    },
    protected: async (req, res) => {
        const { id, fname, lname, tg_id, post, role } = req.user;
        return res.json({ message: 'Доступ разрешен', user: { id, fname, lname, tg_id, post, role } });
    },

    recPass: async (req, res) => {
        if (!validateRecoveryRequest(req, res)) return;
        try {
            const { tg_id } = req.body;
            const recPass = await AuthModel.recPass(tg_id);
            if (!recPass) return res.status(403).json({ message: 'Восстановление недоступно для указанных данных' });
            return res.status(200).json({
                message: "Для восстановления пароля",
                recoverPassword: {
                    questions: recPass.question
                }
            });
        } catch (err) {
            console.error('Ошибка получения вопроса восстановления');
            return res.status(500).json({ message: 'Ошибка сервера' });
        }
    },

    recAns: async (req, res) => {
        if (!validateRecoveryRequest(req, res)) return;
        if (!isNonEmptyString(req.body.secAns)) return res.status(400).json({ message: 'Введите ответ на проверочный вопрос' });
        try {
            const { tg_id, secAns } = req.body;
            const recPass = await AuthModel.recAns(tg_id, secAns);

            if (recPass) {
                const recoveryToken = recovery.issue(recPass.id, tg_id);
                if (!recoveryToken) return res.status(503).json({ message: 'Восстановление временно недоступно' });
                return res.status(200).json({
                    message: "Ответ верный. Переходите к восстановлению пароля.",
                    recoveryToken,
                    expiresIn: 300
                });
            } else {
                return res.status(403).json({ message: "Неверный ответ на вопрос" });
            }
        } catch (err) {
            console.error('Ошибка проверки ответа восстановления');
            return res.status(500).json({ message: 'Ошибка сервера' });
        }
    },

    newPass: async (req, res) => {
        if (!validateRecoveryRequest(req, res)) return;
        const { tg_id, textNewPassword, recoveryToken } = req.body;
        if (!isValidPassword(textNewPassword)) return res.status(400).json({ message: 'Введите пароль' });
        const userId = recovery.consume(recoveryToken, tg_id);
        if (userId === null) return res.status(403).json({ message: 'Подтвердите восстановление пароля заново' });
        try {
            const hash = await hashPassword(textNewPassword);
            const newPasswords = await AuthModel.newPassword(userId, tg_id, hash);
            if (!newPasswords) return res.status(403).json({ message: 'Подтвердите восстановление пароля заново' });
            return res.status(200).json({ message: "Пароль успешно изменён", success: true });
        } catch (err) {
            return authFailure(res, err);
        }
    }
};

module.exports = AuthController;
