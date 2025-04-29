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

            return res.status(201).json({ message: "Пользователь успешно изменён", user: users });
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

    }
};

module.exports = UsersController;