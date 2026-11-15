const TaskModel = require("../models/taskModel");

const TaskController = {
    getAllTasks: async (req, res) => {
        res.locals.errorOperation = 'Ошибка загрузки задач';
        // Сохраняем прежнее поле error у технических ошибок маршрутов задач.
        res.locals.errorResponseField = 'error';
        const tasks = await TaskModel.getAllTasks();
        res.json(tasks);
    },
    addNewTask: async (req, res) => {
        res.locals.errorOperation = 'Ошибка создания задачи';
        res.locals.errorResponseField = 'error';
        const { content, id_user, end_date, start_date } = req.body;
        const checkVacation = await TaskModel.checkVacationUser(id_user);
        if(!checkVacation) {
            const newTask = await TaskModel.addNewTasks(content, id_user, end_date, start_date);
            res.json({message: "Задача успешно добавлена", task: newTask, checkVacation: false});
        } else {
            res.json({message: "Сотрудник в отпуске", checkVacation: true});
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
        res.locals.errorOperation = 'Ошибка изменения задачи';
        res.locals.errorResponseField = 'error';
        const { id } = req.params;
        const updates = req.body;
        const updatedTask = await TaskModel.updateTask(id, updates);
        res.json(updatedTask);
    },

    deleteTask: async (req, res) => {
        res.locals.errorOperation = 'Ошибка удаления задачи';
        res.locals.errorResponseField = 'error';
        const { id } = req.params;
        const delTask = await TaskModel.deleteTask(id);
        if (!delTask) {
            return res.status(404).json({ error: "Задача не найдена" }); // "Task not found"
        }
        res.json({ message: "Задача успешно удалена", task: delTask }); // "Task deleted successfully"
    }
};

module.exports = TaskController;
