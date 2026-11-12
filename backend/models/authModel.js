const postgree = require('../db');
const { isNonEmptyString, answersMatch } = require('../utils/passwordRecovery');

const AuthModel = {
    findUserById: async (id) => {
        const result = await postgree.query('SELECT id, fname, lname, tg_id, post, role FROM users WHERE id = $1', [id]);
        return result.rows[0] || null;
    },
    createUser: async (fname, lname, tg_id, post, role, pass) => {
        const query = 'INSERT INTO users (fname, lname, tg_id, role, post, password) VALUES ($1, $2, $3, $4, $5, $6)';
        const values = [fname, lname, tg_id, role, post, pass];
        const res = await postgree.query(query, values);
        return res.rows[0];
    },
    delUser: async (id_user) => {
        const result = await postgree.query("DELETE FROM users WHERE id = $1;", [id_user]);
        return result;
    },
    findUserByTGid: async (tg_id) => { // Исправлено на TG_ID
        const query = 'SELECT * FROM users WHERE tg_id = $1';
        const values = [tg_id];
        const res = await postgree.query(query, values);
        return res.rows[0];
    },
    recPass: async (tg_id) => {
        const query = await postgree.query("SELECT id, question, answer FROM users WHERE tg_id = $1;", [tg_id]);
        const user = query.rows[0];
        // Ambiguous accounts and unset recovery credentials cannot authorize a reset.
        if (query.rows.length !== 1 || !isNonEmptyString(user.question) || !isNonEmptyString(user.answer)) return null;
        return { id: user.id, question: user.question };
    },
    recAns: async (tg_id, secAns) => {
        const query = await postgree.query("SELECT id, answer, question FROM users WHERE tg_id = $1", [tg_id]);
        const user = query.rows[0];
        if (query.rows.length === 1 && isNonEmptyString(user.question) && answersMatch(user.answer, secAns)) return { id: user.id };
        return null;
    },
    newPassword: async (id, tg_id, textNewPassword) => {
        const query = `
        UPDATE users 
        SET 
            password = $1
        WHERE id = $2 AND tg_id = $3
        RETURNING id;
    `;
        const values = [textNewPassword, id, tg_id];
        const result = await postgree.query(query, values);
        return result.rows[0] || null;
    }
};

module.exports = AuthModel;
