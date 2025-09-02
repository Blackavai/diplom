const teamModel = require("../models/teamModel");

const teamController = {
    getAllTeam: async (req, res) => {
      try{
          const teams = await teamModel.getAllTeams();
          res.json(teams);
      } catch (err){
          console.error(err);
          return res.status(500).json({ message: "Ошибка сервера" });
      }
    },
    createTeam: async (req, res) => {
        try {
            const { nameTeam } = req.body;
            const newTeam = await teamModel.createTeams(nameTeam, descriptionTeam);
            res.json({ message: "Команда успешно удалена", task: newTeam});
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Ошибка сервера" });
        }
    },

    viewTeam: async (req, res) => {
        try{
            const { id } = req.params;
            const viewTeams = await teamModel.viewTeams(id);
            res.json({message: "Информация о команде", view: viewTeams});
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Ошибка сервера" });
        }
    },

    editTeam: async (req, res) => {
        try {
            const { id } = req.params;
            const { newNameTeam, descriptionTeam } = req.body;
            const editTeams = await teamModel.editTeams(id, newNameTeam, descriptionTeam);
            res.json({message: "Команда успешно изменена", edit: editTeams});
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Ошибка сервера" });
        }
    },

    addUserTeam: async (req, res) => {
        try {
            const { id } = req.params;
            const { usersId } = req.body;
            const addUsersTeam = await teamModel.addUserTeams(id, usersId);
            res.json({message:"Пользователи добавлены", team: addUsersTeam});
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Ошибка сервера" });
        }
    },

    delUserTeams: async (req, res) => {
        const { id } = req.params;
        try {
            const delUser = await teamModel.delUserTeam(id);
            res.json({ message: "Пользователь удалён из команды", team: delUser });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Ошибка сервера" });
        }
    },

    delTeam: async (req, res) => {
        const { id } = req.params;
        try {
            const delTeam = await teamModel.delTeams(id);
            res.json({ message: "Команда успешно удалена", team: delTeam });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Ошибка сервера" });
        }
    },
};

module.exports = teamController;