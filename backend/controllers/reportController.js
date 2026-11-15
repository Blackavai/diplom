const reportModel = require("../models/reportModel");
const { positiveId } = require('../middleware/authMiddleware');
const { isValidReportText, isValidReportDate } = require('../utils/reportValidation');

const reportController = {
    getAllReport: async (req, res) => {
        res.locals.errorOperation = 'Ошибка загрузки отчётов';
        const reports = await reportModel.getAllReports();
        res.json(reports);
    },
    acceptReport: async (req, res) => {
        res.locals.errorOperation = 'Ошибка принятия отчёта';
        const { id } = req.params;
        const reports = await reportModel.acceptReports(id);
        res.json(reports);
    },
    newReport: async (req, res) => {
        res.locals.errorOperation = 'Ошибка отправки отчёта';
        const { id_task, text_report, end_date } = req.body || {};
        const taskId = positiveId(id_task);
        if (taskId === null || !isValidReportText(text_report) || !isValidReportDate(end_date)) {
            return res.status(400).json({ message: 'Некорректные данные отчёта' });
        }
        // Автор всегда берётся из проверенной сессии, а не из body.id_user.
        const report = await reportModel.newReports(taskId, req.user.id, text_report, end_date);
        if (!report) return res.status(404).json({ message: 'Задача не найдена или недоступна' });
        return res.json({ message: "Отчёт успешно отправлен" });
    }
};

module.exports = reportController;
