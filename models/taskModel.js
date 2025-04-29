const postgree = require("../db");

const TaskModel = {
    getAllTasks: async () => {
        const result = await postgree.query("SELECT * FROM task_list;");
        return result.rows;
    },
    getTaskById: async (id) => {
        // const result = await postgree.query("SELECT * FROM task_list WHERE id = $1;", [id]);
        // return result.rows[0];
    },
    updateTaskStatus: async (id, status) => {
        // const result = await postgree.query("UPDATE task_list SET status = $1 WHERE id = $2 RETURNING *;", [status, id]);
        // return result.rows[0];
    },
};

module.exports = TaskModel;