const postgree = require("../db");

const teamModel = {
    getAllTeam: async () => {
        const result = await postgree.query("SELECT * FROM report_list;");
        return result.rows;
    },
    acceptReports: async (id) => {
        const query = `UPDATE report_list SET check_report = true WHERE id = $1 RETURNING *;`;
        const values = [id];
        const result = await postgree.query(query, values);
        return result.rows[0];
    }
};

module.exports = teamModel;