const UsersModel = require("../models/userModel");

const UsersController = {
    getAllUsers: async (req, res) => {
        try{
            const users = await UsersModel.getAllUsers();
            res.json(users);
        } catch (err){
            console.error(err);
            return res.status(500).json({ message: "Ошибка сервера" });
        }
    },

    updateUserInfo: async (req, res)=> {
        try{
            const { id } = req.params;
            const { fname, lname, post } = req.body;
            const users = await UsersModel.updateUserInfo(id, fname, lname, post);
            if (!users) return res.status(404).json({ message: "Пользователь не найден" });
            const { id: userId, fname: firstName, lname: lastName, tg_id, post: position, role } = users;
            return res.status(201).json({ message: "Пользователь успешно изменён", user: {
                id: userId, fname: firstName, lname: lastName, tg_id, post: position, role
            } });
        } catch (err){
            console.error(err);
            return res.status(500).json({ message: "Ошибка сервера" });
        }
    },

    deleteUser: async (req, res)=> {
        try{
            const { id } = req.params;
            const delUser = await UsersModel.deleteUser(id);
            return res.status(201).json({ message: "Пользователь успешно удалён", user: delUser });
        } catch(err){
            console.error(err);
            return res.status(500).json({ message: "Ошибка сервера" });
        }
    },

    vacationUser: async (req, res)=> {
        try{
            const { id } = req.params;
            const { startHoliday, endHoliday } = req.body;
            const vacUser = await UsersModel.vacUsers(id, startHoliday, endHoliday);
            return res.status(201).json({ message: "Отпуск создан", user: vacUser });
        } catch(err){
            console.error(err);
            return res.status(500).json({ message: "Ошибка сервера" });
        }
    },

    allVacationUser: async (req, res)=> {
        try{
            const allVacUser = await UsersModel.allVacUsers();
            return res.status(201).json({ message: "Список всех отпусков", user: allVacUser });
        } catch(err){
            console.error(err);
            return res.status(500).json({ message: "Ошибка сервера" });
        }
    },

    checkTeam: async (req, res) => {
        try{
            const { id } = req.params;
            const CheckTeam = await UsersModel.checkTeamUser(id);
            return res.status(201).json({ user: CheckTeam });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Ошибка сервера" });
        }

    },

    checkCountTasks: async (req, res) => {
        try{
            const { id } = req.params;
            const CheckCountTask = await UsersModel.checkCountTaskUser(id);
            return res.status(201).json({ user: CheckCountTask });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Ошибка сервера" });
        }
    },

    checkVacation: async (req, res) => {
        try{
            const { id } = req.params;
            const CheckVacation = await UsersModel.checkVacationUser(id);
            return res.status(201).json({ user: CheckVacation });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Ошибка сервера" });
        }
    }
};

module.exports = UsersController;
