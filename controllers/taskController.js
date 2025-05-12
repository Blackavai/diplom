const TaskModel = require("../models/taskModel");

const TaskController = {
    getAllTasks: async (req, res) => {
        try {
            const tasks = await TaskModel.getAllTasks();
            res.json(tasks);
        } catch (err) {
            console.error(err.message);
            res.status(500).json({ error: "Ошибка сервера" });
        }
    },
    addNewTask: async (req, res) => {
        try {
            const { content, id_user, end_date } = req.body;
            const checkVacation = await TaskModel.checkVacationUser(id_user);
            if(!checkVacation) {
                const newTask = await TaskModel.addNewTasks(content, id_user, end_date);
                res.json({message: "Задача успешно удалена", task: newTask});
            } else {
                res.json({message: "Сотрудник в отпуске"});
            }
        } catch (err) {
            console.error(err.message);
            res.status(500).json({error: "Ошибка сервера"});
        }
    },
    // getTaskById: async (req, res) => {
    //     const { id } = req.params;
    //     try {
    //         const task = await TaskModel.getTaskById(id);
    //         if (!task) {
    //             return res.status(404).json({ error: "Task not found" });
    //         }
    //         res.json(task);
    //     } catch (err) {
    //         console.error(err.message);
    //         res.status(500).json({ error: "Ошибка сервера" });
    //     }
    // },
    updateTaskContent: async (req, res) => {
        const { id } = req.params;
        const updates = req.body;
        try {
            const updatedTask = await TaskModel.updateTask(id, updates);
            res.json(updatedTask);
        } catch (err) {
            console.error(err.message);
            res.status(500).json({ error: "Ошибка сервера" });
        }
    },

    deleteTask: async (req, res) => {
        const { id } = req.params;
        try {
            const delTask = await TaskModel.deleteTask(id);
            if (!delTask) {
                return res.status(404).json({ error: "Задача не найдена" }); // "Task not found"
            }
            res.json({ message: "Задача успешно удалена", task: delTask }); // "Task deleted successfully"
        } catch (err) {
            console.error(err.message);
            res.status(500).json({ error: "Ошибка сервера" }); // "Server error"
        }
    }
};

module.exports = TaskController;