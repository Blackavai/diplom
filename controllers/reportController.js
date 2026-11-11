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
    },
    newReport: async (req, res) => {
    try {
        const { id_task, id_user, text_report, end_date } = req.body;

        // Log the received data
        console.log('Received report data:', req.body);

        const reports = await reportModel.newReports(id_task, id_user, text_report, end_date);
        res.json({ message: "Отчёт успешно отправлен" });
    } catch (err) {
        console.error("Server error:", err);
        return res.status(500).json({ message: "Ошибка сервера" });
    }
}
};

module.exports = reportController;