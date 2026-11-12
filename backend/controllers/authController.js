const AuthModel = require("../models/authModel");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const postgree = require("../db");
const { recovery, isNonEmptyString } = require('../utils/passwordRecovery');

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
        try {
            const { fname, lname, tg_id, post, role, pass } = req.body;
            const existingUser = await AuthModel.findUserByTGid(tg_id);
            if (existingUser) {
                return res.status(400).json({ message: "Пользователь с таким id уже существует." });
            }
            // const hashedPassword = await bcrypt.hash(password, 10);
            const newUser = await AuthModel.createUser(fname, lname, tg_id, post, role, pass);
            return res.status(201).json({ message: "Пользователь успешно зарегистрирован", user: newUser });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Ошибка сервера" });
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
        try {
            const { tg_id, password } = req.body;
            const user = await AuthModel.findUserByTGid(tg_id);

            if (!user) {
                return res.status(400).json({ message: "Пользователь не найден." });
            }

            // if(user.role != 1){
            //     return res.status(400).json({ message: "Пользователь не является менеджером" });
            // }

            // const isMatch = await bcrypt.compare(password, user.password);
            const isMatch = password === user.password;
            if (!isMatch) {
                return res.status(400).json({ message: "Неверный пароль." });
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
            console.error(err);
            return res.status(500).json({ message: "Ошибка сервера" });
        }
    },
    protected: async (req, res) => {
        const token = req.cookies.token;
        if (!token) return res.status(401).json({ message: 'Нет токена' });

        jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
            if (err) return res.status(403).json({ message: 'Неверный токен' });
            res.json({ message: 'Доступ разрешен', user: decoded });
        });
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
        if (!isNonEmptyString(textNewPassword, 1024)) return res.status(400).json({ message: 'Введите пароль длиной до 1024 символов' });
        const userId = recovery.consume(recoveryToken, tg_id);
        if (userId === null) return res.status(403).json({ message: 'Подтвердите восстановление пароля заново' });
        try {
            // const hashedPassword = await bcrypt.hash(textNewPassword, 10);
            const newPasswords = await AuthModel.newPassword(userId, tg_id, textNewPassword);
            if (!newPasswords) return res.status(403).json({ message: 'Подтвердите восстановление пароля заново' });
            return res.status(200).json({ message: "Пароль успешно изменён", success: true });
        } catch (err) {
            console.error('Ошибка смены пароля при восстановлении');
            return res.status(500).json({ message: 'Ошибка сервера. Подтвердите восстановление заново.' });
        }
    }
};

module.exports = AuthController;
