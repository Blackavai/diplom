const postgree = require('../db');

const AuthModel = {
    createUser: async (fname, lname, tg_id, post, role) => {
        const query = 'INSERT INTO users (fname, lname, tg_id, role, post) VALUES ($1, $2, $3, $4, $5)';
        const values = [fname, lname, tg_id, role, post]; // Убедитесь, что порядок значений соответствует запросу
        const res = await postgree.query(query, values);
        return res.rows[0];
    },
    delUser: async (id_user) => {
        const result = await postgree.query("DELETE FROM users WHERE id = $1;", [id_user]);
        return result;
    },
    findUserByTGid: async (tg_id) => { // Исправлено на TG_ID
        const query = 'SELECT * FROM users WHERE tg_id = $1'; // Убедитесь, что используете правильное имя столбца
        const values = [tg_id];
        const res = await postgree.query(query, values);
        return res.rows[0];
    },
    recPass: async (tg_id) => {
        const query = await postgree.query("SELECT question FROM users WHERE tg_id = $1;", [tg_id]);
        if (query.rows.length === 0) {
            throw new Error("Пользователь не найден"); // Обработка случая, когда пользователь не найден
        }
        return query.rows[0];
    },
    recAns: async (tg_id, secAns) => {
        const query = await postgree.query("SELECT answer, question FROM users WHERE tg_id = $1", [tg_id]);
        if (query.rows.length > 0) {
            const user = query.rows[0];
            if (user.answer === secAns) {
                return {
                    question: user.question,
                    answer: user.answer
                };
            }
        }
        return null;
    },
    newPassword: async (tg_id, textNewPassword) => {
        const query = `
        UPDATE users 
        SET 
            password = $1
        WHERE tg_id = $2 
        RETURNING *;
    `;
        const values = [textNewPassword, tg_id];
        const result = await postgree.query(query, values);
        if (result.rows.length === 0) {
            throw new Error("Пользователь не найден"); // Обработка случая, когда пользователь не найден
        }
        return result.rows[0];
    }
};

module.exports = AuthModel;
