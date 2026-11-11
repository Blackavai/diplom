const AuthModel = require("../models/authModel");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const postgree = require("../db");

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
        try {
            const { tg_id } = req.body;
            const recPass = await AuthModel.recPass(tg_id);
            return res.status(200).json({
                message: "Для восстановления пароля",
                recoverPassword: {
                    questions: recPass.question
                }
            });
        } catch (err) {
            return res.status(404).json({ message: err.message || "Ошибка сервера" }); // Возвращаем 404, если пользователь не найден
        }
    },

    recAns: async (req, res) => {
        try {
            const { tg_id, secAns } = req.body;
            const recPass = await AuthModel.recAns(tg_id, secAns);

            if (recPass) {
                return res.status(200).json({
                    message: "Ответ верный. Переходите к восстановлению пароля.",
                    recoverPassword: {
                        questions: recPass.question,
                        answers: recPass.answer
                    }
                });
            } else {
                return res.status(403).json({ message: "Неверный ответ на вопрос" });
            }
        } catch (err) {
            return res.status(500).json({ message: err.message || "Ошибка сервера" });
        }
    },

    newPass: async (req, res) => {
        try {
            const { tg_id, textNewPassword } = req.body;
            // const hashedPassword = await bcrypt.hash(textNewPassword, 10);
            const newPasswords = await AuthModel.newPassword(tg_id, textNewPassword);
            return res.status(200).json({ message: "Пароль успешно изменён", success: true });
        } catch (err) {
            console.error(err);
            return res.status(404).json({ message: err.message || "Ошибка сервера" }); // Возвращаем 404, если пользователь не найден
        }
    }
};

module.exports = AuthController;
