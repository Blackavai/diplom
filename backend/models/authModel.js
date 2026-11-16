const postgree = require('../db');
const UserModel = require('./userModel');

const AuthModel = {
    findUserById: async (id) => {
        const result = await postgree.query('SELECT id, fname, lname, tg_id, post, role, session_version, password_change_recommended FROM users WHERE id = $1', [id]);
        return result.rows[0] || null;
    },
    revokeSessions: async (id, sessionVersion) => {
        // Повторный выход со старым JWT не отзывает более новую сессию.
        const result = await postgree.query(`UPDATE users
            SET session_version = session_version + 1
            WHERE id = $1 AND session_version = $2 RETURNING id`, [id, sessionVersion]);
        return result.rowCount === 1;
    },
    findPasswordById: async (id) => {
        const result = await postgree.query('SELECT password FROM users WHERE id = $1', [id]);
        return result.rows[0] || null;
    },
    upgradePassword: async (id, oldPassword, hash) => {
        const result = await postgree.query('UPDATE users SET password = $1 WHERE id = $2 AND password = $3', [hash, id, oldPassword]);
        return result.rowCount === 1;
    },
    createUser: async (fname, lname, tg_id, post, role, pass) => {
        const query = 'INSERT INTO users (fname, lname, tg_id, role, post, password, password_change_recommended) VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id, fname, lname, tg_id, post, role';
        const values = [fname, lname, tg_id, role, post, pass];
        const res = await postgree.query(query, values);
        return res.rows[0];
    },
    findCredentialsById: async (id) => {
        const result = await postgree.query(
            'SELECT id, role, password, session_version FROM users WHERE id=$1', [id]);
        return result.rows[0] || null;
    },
    changeOwnPassword: async (credentials, hash) => {
        // Проверенный пароль и версия должны оставаться актуальными после scrypt.
        const result = await postgree.query(`UPDATE users
            SET password=$1, password_change_recommended=false, session_version=session_version+1
            WHERE id=$2 AND password=$3 AND session_version=$4 RETURNING id`,
        [hash, credentials.id, credentials.password, credentials.session_version]);
        return result.rowCount === 1;
    },
    resetUserPassword: async (manager, target, hash) => {
        const client = await postgree.connect();
        try {
            await client.query('BEGIN');
            // Единый порядок блокировок исключает взаимную блокировку двух сбросов.
            const rows = await client.query(`SELECT id, role, password, session_version FROM users
                WHERE id=ANY($1::integer[]) ORDER BY id FOR UPDATE`, [[manager.id, target.id]]);
            const currentManager = rows.rows.find((user) => user.id === manager.id);
            const currentTarget = rows.rows.find((user) => user.id === target.id);
            if (!currentManager || currentManager.role !== 1 || currentManager.password !== manager.password ||
                currentManager.session_version !== manager.session_version || !currentTarget ||
                currentTarget.password !== target.password || currentTarget.session_version !== target.session_version) {
                const error = new Error('Проверенные данные доступа изменились');
                error.code = 'CREDENTIALS_CHANGED';
                throw error;
            }
            const result = await client.query(`UPDATE users
                SET password=$1, password_change_recommended=true, session_version=session_version+1
                WHERE id=$2 RETURNING id`, [hash, target.id]);
            if (result.rowCount !== 1) throw new Error('Password update failed');
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    },
    delUser: async (id_user) => {
        const user = await UserModel.deleteUser(id_user);
        return { rowCount: user ? 1 : 0 };
    },
    findUserByTGid: async (tg_id) => { // Исправлено на TG_ID
        const query = 'SELECT * FROM users WHERE tg_id = $1';
        const values = [tg_id];
        const res = await postgree.query(query, values);
        return res.rows[0];
    },
};

module.exports = AuthModel;
