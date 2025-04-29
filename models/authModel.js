const postgree = require('../db');

const AuthModel = {
    createUser: async (fname, lname, tg_id, post, password) => {
        const query = 'INSERT INTO users (fname, lname, tg_id, role, post, password) VALUES ($1, $2, $3, $4, $5, $6)';
        const values = [fname, lname, tg_id, 1, post, password]; // Убедитесь, что порядок значений соответствует запросу
        const res = await postgree.query(query, values);
        return res.rows[0];
    },
    findUserByTGid: async (tg_id) => { // Исправлено на TG_ID
        const query = 'SELECT * FROM users WHERE tg_id = $1'; // Убедитесь, что используете правильное имя столбца
        const values = [tg_id];
        const res = await postgree.query(query, values);
        return res.rows[0];
    }
};

module.exports = AuthModel;
