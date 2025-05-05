const teamModel = require("../models/teamModel");
const reportModel = require("../models/reportModel");

const teamController = {
    getAllTeam: async (req, res) => {
      try{

      } catch (err){
          console.error(err);
          return res.status(500).json({ message: "Ошибка сервера" });
      }
    },
    createTeam: async (req, res) => {
        try {

        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Ошибка сервера" });
        }
    },

    editTeam: async (req, res) => {
        try {
            const reports = await reportModel.getAllReports();
            res.json(reports);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Ошибка сервера" });
        }
    },

    addUserTeam: async (req, res) => {
        try {

        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Ошибка сервера" });
        }
    },

    delTeam: async (req, res) => {
        try {

        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Ошибка сервера" });
        }
    },
};

module.exports = teamController;