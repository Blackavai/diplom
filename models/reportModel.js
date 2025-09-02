const postgree = require("../db");

const reportModel = {
    getAllReports: async () => {
        const result = await postgree.query("SELECT report_list.*, users.fname, users.lname, task_list.content FROM report_list INNER JOIN users ON report_list.id_user = users.id INNER JOIN task_list ON report_list.id_task = task_list.id;;");
        return result.rows;
    },
    acceptReports: async (id) => {
        const query = `UPDATE report_list SET check_report = true WHERE id = $1 RETURNING *;`;
        const values = [id];
        const result = await postgree.query(query, values);
        return result.rows[0];
    }
};

module.exports = reportModel;