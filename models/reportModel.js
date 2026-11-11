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
        const query = 'INSERT INTO report_list(id_task, id_user, text_report, end_date, status_task) VALUES ($1, $2, $3, $4, true) RETURNING *;';
        const values = [id_task, id_user, text_report, end_date];
        const result = await postgree.query(query, values);
        const query2 = 'UPDATE task_list SET status = true WHERE id = $1 RETURNING *;';
        const value2 = [id_task];
        const result2 = await postgree.query(query2, value2);
        return result.rows[0];    
    }

};

module.exports = reportModel;