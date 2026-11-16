const postgree = require("../db");
const { businessDate } = require('../utils/dateValidation');

const TaskModel = {
    getAllTasks: async () => {
        const result = await postgree.query("SELECT * FROM task_list;");
        return result.rows;
    },
    getTaskById: async (id) => {
        // const result = await postgree.query("SELECT * FROM task_list WHERE id = $1;", [id]);
        // return result.rows[0];
    },
    addNewTasks: async (content, id_user, end_date, start_date) => {
        const query = 'INSERT INTO task_list(content, id_user, end_date, status, start_date) VALUES ($1, $2, $3, false, $4) RETURNING id, content, id_user, start_date, end_date, status;';
        const values = [content, id_user, end_date, start_date];
        const result = await postgree.query(query, values);
        return result.rows[0];
    },
    checkVacationUser: async (id_user) => {
        const result = await postgree.query(`SELECT EXISTS (
            SELECT 1 FROM vacation WHERE id_user=$1 AND $2::date BETWEEN start_holiday AND end_holiday
        ) AS on_vacation`, [id_user, businessDate()]);
        return result.rows[0].on_vacation;
    },
    updateTask: async (id, updates) => {
        const { content, end_date, status  } = updates;
        const query = `
        UPDATE task_list 
        SET 
            content = $1, 
            end_date = $2,
            status = $3
        WHERE id = $4 AND start_date <= $2::date
        RETURNING *;
    `;
        const values = [content, end_date, status, id];
        const result = await postgree.query(query, values);
        if (!result.rowCount && (await postgree.query('SELECT id FROM task_list WHERE id=$1', [id])).rowCount) {
            const error = new Error('Срок задачи не может быть раньше начала');
            error.code = 'INVALID_DATE_RANGE';
            throw error;
        }
        return result.rows[0];
    },
    deleteTask: async (id) => {
        const client = await postgree.connect();
        try {
            await client.query('BEGIN');
            const task = await client.query('SELECT id FROM task_list WHERE id=$1 FOR UPDATE', [id]);
            if (!task.rowCount) { await client.query('COMMIT'); return { rowCount: 0 }; }
            const reports = await client.query('SELECT 1 FROM report_list WHERE id_task=$1 LIMIT 1', [id]);
            if (reports.rowCount) {
                const error = new Error('Задача связана с отчётами и не может быть удалена');
                error.code = 'DELETE_HAS_DEPENDENCIES';
                throw error;
            }
            const result = await client.query('DELETE FROM task_list WHERE id=$1', [id]);
            await client.query('COMMIT');
            return result;
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
    }
};

module.exports = TaskModel;
