const AuthModel = require("../models/authModel");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const AuthController = {
    insertNewUser: async (req, res) => {
        try {
            const { fname, lname, tg_id, post, password } = req.body;

            const existingUser = await AuthModel.findUserByTGid(tg_id);
            if (existingUser) {
                return res.status(400).json({ message: "Пользователь с таким id уже существует." });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const newUser = await AuthModel.createUser(fname, lname, tg_id, post, hashedPassword);

            return res.status(201).json({ message: "Пользователь успешно зарегистрирован", user: newUser });
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

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(400).json({ message: "Неверный пароль." });
            }

            const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

            // Устанавливаем токен в куки
            res.cookie('token', token, {
                httpOnly: true, // Защищает куки от доступа через JavaScript
                secure: process.env.NODE_ENV === 'production', // Используйте secure в продакшене
                maxAge: 3600000 // Время жизни куки (1 час)
            });

            // Сохраняем данные пользователя в куки
            res.cookie('userData', JSON.stringify({
                fname: user.fname,
                lname: user.lname,
                tg_id: user.tg_id,
                post: user.post
            }), {
                httpOnly: true, // Защита от доступа через JavaScript
                secure: process.env.NODE_ENV === 'production', // Используйте secure в продакшене
                maxAge: 3600000 // Время жизни куки (1 час)
            });

            return res.status(200).json({ message: "Успешный вход",
                user: {
                    fname: user.fname,
                    lname: user.lname,
                    tg_id: user.tg_id,
                    post: user.post,
                    token: token
                } });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Ошибка сервера" });
        }
    }
};

module.exports = AuthController;
