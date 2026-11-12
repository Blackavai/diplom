const postgree = require("../db");

const reportModel = {
    getAllReports: async () => {
        const result = await postgree.query("SELECT report_list.*, users.fname, users.lname, task_list.content FROM report_list INNER JOIN users ON report_list.id_user = users.id INNER JOIN task_list ON report_list.id_task = task_list.id ORDER BY end_date DESC;;");
        return result.rows;
    },
    acceptReports: async (id) => {
        const query = `UPDATE report_list SET check_report = true WHERE id = $1 RETURNING *;`;
        const values = [id];
        const result = await postgree.query(query, values);
        return result.rows[0];
    },
    newReports: async (id_task, id_user, text_report, end_date) => {
        const client = await postgree.connect();
        try {
            await client.query('BEGIN');
            const task = await client.query('SELECT id FROM task_list WHERE id = $1 AND id_user = $2 FOR UPDATE', [id_task, id_user]);
            if (!task.rowCount) {
                await client.query('ROLLBACK');
                return null;
            }
            const result = await client.query(
                'INSERT INTO report_list(id_task, id_user, text_report, end_date, status_task) VALUES ($1, $2, $3, $4, true) RETURNING id',
                [id_task, id_user, text_report, end_date]
            );
            const updated = await client.query('UPDATE task_list SET status = true WHERE id = $1 AND id_user = $2', [id_task, id_user]);
            if (updated.rowCount !== 1) throw new Error('Task update failed');
            await client.query('COMMIT');
            return result.rows[0];
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

};

module.exports = reportModel;
