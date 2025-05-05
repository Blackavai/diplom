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
    addNewTasks: async (content, id_user, end_date) => {
        const query = 'INSERT INTO task_list(content, id_user, end_date, status) VALUES ($1, $2, $3, false);';
        const values = [content, id_user, end_date];
        const result = await postgree.query(query, values);
        return result.rows[0];
    },
    updateTask: async (id, updates) => {
        const { content, date, status  } = updates; // Предполагаем, что все поля передаются
        const query = `
        UPDATE task_list 
        SET 
            content = $1, 
            end_date = $2,
            status = $3
        WHERE id = $4 
        RETURNING *;
    `;
        const values = [content, date, status, id];
        const result = await postgree.query(query, values);
        return result.rows[0];
    },
    deleteTask: async (id) => {
        const result = await postgree.query("DELETE FROM task_list WHERE id = $1;", [id]);
        return result;
    }
};

module.exports = TaskModel;