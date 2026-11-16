const UsersModel = require("../models/userModel");
const AuthModel = require('../models/authModel');
const { isValidDateRange } = require('../utils/dateValidation');
const { positiveId } = require('../middleware/authMiddleware');
const { isValidUserText } = require('../utils/userValidation');

const UsersController = {
    getAllUsers: async (req, res) => {
        res.locals.errorOperation = 'Ошибка загрузки сотрудников';
        const users = await UsersModel.getAllUsers();
        res.json(users);
    },

    updateUserInfo: async (req, res)=> {
        res.locals.errorOperation = 'Ошибка изменения сотрудника';
        const id = positiveId(req.params.id);
        if (id === null) return res.status(400).json({ message: 'Некорректный идентификатор' });
        const { fname, lname, post } = req.body || {};
        if (!isValidUserText(fname) || !isValidUserText(lname) || !isValidUserText(post)) {
            return res.status(400).json({ message: 'Имя, фамилия и должность должны быть непустыми строками до 255 символов' });
        }
        const users = await UsersModel.updateUserInfo(id, fname, lname, post);
        if (!users) return res.status(404).json({ message: "Пользователь не найден" });
        const { id: userId, fname: firstName, lname: lastName, tg_id, post: position, role } = users;
        return res.status(201).json({ message: "Пользователь успешно изменён", user: {
            id: userId, fname: firstName, lname: lastName, tg_id, post: position, role
        } });
    },

    deleteUser: async (req, res)=> {
        res.locals.errorOperation = 'Ошибка удаления сотрудника';
        const id = positiveId(req.params.id);
        if (id === null) return res.status(400).json({ message: 'Некорректный идентификатор' });
        let delUser;
        try { delUser = await UsersModel.deleteUser(id); }
        catch (error) {
            if (error.code === 'DELETE_HAS_DEPENDENCIES' || error.code === '23503') return res.status(409).json({ message: 'Сотрудник связан с задачами, отчётами, отпусками или командами и не может быть удалён' });
            throw error;
        }
        if (!delUser) return res.status(404).json({ message: 'Пользователь не найден' });
        return res.status(201).json({ message: "Пользователь успешно удалён", user: delUser });
    },

    vacationUser: async (req, res)=> {
        res.locals.errorOperation = 'Ошибка создания отпуска';
        const id = positiveId(req.params.id);
        const { startHoliday, endHoliday } = req.body || {};
        if (id === null || !isValidDateRange(startHoliday, endHoliday)) {
            return res.status(400).json({ message: 'Некорректные данные отпуска' });
        }
        if (!await AuthModel.findUserById(id)) return res.status(404).json({ message: 'Пользователь не найден' });
        let vacUser;
        try {
            vacUser = await UsersModel.vacUsers(id, startHoliday, endHoliday);
        } catch (error) {
            if (error.code === '23503' && !await AuthModel.findUserById(id)) {
                return res.status(404).json({ message: 'Пользователь не найден' });
            }
            throw error;
        }
        if (!vacUser) throw new Error('Vacation insert returned no row');
        return res.status(201).json({ message: "Отпуск создан", user: vacUser });
    },

    allVacationUser: async (req, res)=> {
        res.locals.errorOperation = 'Ошибка загрузки отпусков';
        const allVacUser = await UsersModel.allVacUsers();
        return res.status(201).json({ message: "Список всех отпусков", user: allVacUser });
    },

    checkTeam: async (req, res) => {
        res.locals.errorOperation = 'Ошибка загрузки команды сотрудника';
        const { id } = req.params;
        const CheckTeam = await UsersModel.checkTeamUser(id);
        return res.status(201).json({ user: CheckTeam });
    },

    checkCountTasks: async (req, res) => {
        res.locals.errorOperation = 'Ошибка загрузки задач сотрудника';
        const { id } = req.params;
        const CheckCountTask = await UsersModel.checkCountTaskUser(id);
        return res.status(201).json({ user: CheckCountTask });
    },

    checkVacation: async (req, res) => {
        res.locals.errorOperation = 'Ошибка загрузки отпуска сотрудника';
        const { id } = req.params;
        const CheckVacation = await UsersModel.checkVacationUser(id);
        return res.status(201).json({ user: CheckVacation });
    }
};

module.exports = UsersController;
