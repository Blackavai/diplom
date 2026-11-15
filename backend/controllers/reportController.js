const reportModel = require("../models/reportModel");
const { positiveId } = require('../middleware/authMiddleware');
const { isValidReportText, isValidReportDate } = require('../utils/reportValidation');

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
        const { id_task, text_report, end_date } = req.body || {};
        const taskId = positiveId(id_task);
        if (taskId === null || !isValidReportText(text_report) || !isValidReportDate(end_date)) {
            return res.status(400).json({ message: 'Некорректные данные отчёта' });
        }
        try {
            // Автор всегда берётся из проверенной сессии, а не из body.id_user.
            const report = await reportModel.newReports(taskId, req.user.id, text_report, end_date);
            if (!report) return res.status(404).json({ message: 'Задача не найдена или недоступна' });
            return res.json({ message: "Отчёт успешно отправлен" });
        } catch {
            console.error('Ошибка отправки отчёта');
            return res.status(500).json({ message: "Ошибка сервера" });
        }
    }
};

module.exports = reportController;
