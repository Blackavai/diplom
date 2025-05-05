const reportModel = require("../models/reportModel");

const reportController = {
    getAllReport: async (req, res) => {
        try {
            const reports = await reportModel.getAllReports();
            res.json(reports);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Ошибка сервера" });
        }
    },
    acceptReport: async (req, res) => {
        const { id } = req.params;
        try {
            const reports = await reportModel.acceptReports(id);
            res.json(reports);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Ошибка сервера" });
        }
    }
};

module.exports = reportController;