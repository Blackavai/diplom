const TaskModel = require("../models/taskModel");
const AuthModel = require('../models/authModel');
const { positiveId } = require('../middleware/authMiddleware');
const { isValidDateInput } = require('../utils/dateValidation');
const { isValidTaskContent, getTaskEndDate } = require('../utils/taskValidation');

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
        const { content, id_user, end_date, start_date } = req.body || {};
        const userId = positiveId(id_user);
        if (!isValidTaskContent(content) || userId === null || !isValidDateInput(start_date) || !isValidDateInput(end_date)) {
            return res.status(400).json({ message: 'Некорректные данные задачи' });
        }
        if (!await AuthModel.findUserById(userId)) return res.status(404).json({ message: 'Сотрудник не найден' });
        const checkVacation = await TaskModel.checkVacationUser(userId);
        if(!checkVacation) {
            try {
                const newTask = await TaskModel.addNewTasks(content, userId, end_date, start_date);
                if (!newTask) throw new Error('Task insert returned no row');
                res.json({message: "Задача успешно добавлена", task: newTask, checkVacation: false});
            } catch (error) {
                // Получателя могли удалить между проверкой и INSERT. Другие SQL-ошибки не скрываем.
                if (error?.code === '23503' && !await AuthModel.findUserById(userId)) {
                    return res.status(404).json({ message: 'Сотрудник не найден' });
                }
                throw error;
            }
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
        const taskId = positiveId(id);
        const { content, status } = req.body || {};
        const endDate = getTaskEndDate(req.body);
        if (taskId === null || !isValidTaskContent(content) || typeof status !== 'boolean' || endDate === null) {
            return res.status(400).json({ message: 'Некорректные данные задачи' });
        }
        const updatedTask = await TaskModel.updateTask(taskId, { content, end_date: endDate, status });
        if (!updatedTask) return res.status(404).json({ error: 'Задача не найдена' });
        res.json(updatedTask);
    },

    deleteTask: async (req, res) => {
        res.locals.errorOperation = 'Ошибка удаления задачи';
        res.locals.errorResponseField = 'error';
        const { id } = req.params;
        const taskId = positiveId(id);
        if (taskId === null) return res.status(400).json({ message: 'Некорректный идентификатор' });
        const delTask = await TaskModel.deleteTask(taskId);
        if (!delTask || !delTask.rowCount) {
            return res.status(404).json({ error: "Задача не найдена" }); // "Task not found"
        }
        res.json({ message: "Задача успешно удалена", task: delTask }); // "Task deleted successfully"
    }
};

module.exports = TaskController;
