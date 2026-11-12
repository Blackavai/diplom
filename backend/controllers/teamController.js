const teamModel = require('../models/teamModel');

const validId = (value) => /^(?:[1-9]\d*)$/.test(String(value)) && Number(value) <= 2147483647;
const validMembers = (value) => Array.isArray(value) && value.every((id) => Number.isInteger(id) && validId(id));
const validName = (value) => typeof value === 'string' && value.trim().length > 0 && [...value].length <= 255;
const validDescription = (value) => value == null || (typeof value === 'string' && [...value].length <= 255);
const invalid = (res) => res.status(400).json({ message: 'Некорректные данные команды или участников' });
const missing = (res) => res.status(404).json({ message: 'Команда не найдена' });
function failure(res, error) {
    if (error.status === 400) return res.status(400).json({ message: error.message });
    if (error.code === '23503' || error.code === '40001' || error.code === '40P01') {
        return res.status(409).json({ message: 'Связанные данные изменились. Обновите команду и повторите запрос' });
    }
    // SQL exceptions may contain personal data; do not print their details.
    console.error('Ошибка операции с командой');
    return res.status(500).json({ message: 'Ошибка сервера' });
}

const teamController = {
    getAllTeam: async (req, res) => {
        try { res.json(await teamModel.getAllTeams()); }
        catch (error) { return failure(res, error); }
    },

    createTeam: async (req, res) => {
        const { nameTeam, descriptionTeam, usersId = [] } = req.body || {};
        if (!validName(nameTeam) || !validDescription(descriptionTeam) || !validMembers(usersId)) return invalid(res);
        try {
            const team = await teamModel.createTeams(nameTeam, descriptionTeam, usersId);
            res.json({ message: 'Команда успешно создана', task: { id: team.id } });
        } catch (error) { return failure(res, error); }
    },

    viewTeam: async (req, res) => {
        const { id } = req.params;
        if (!validId(id)) return invalid(res);
        try { res.json({ message: 'Информация о команде', view: await teamModel.viewTeams(id) }); }
        catch (error) { return failure(res, error); }
    },

    editTeam: async (req, res) => {
        const { id } = req.params;
        const { newNameTeam, descriptionTeam, usersId = [] } = req.body || {};
        if (!validId(id) || !validName(newNameTeam) || !validDescription(descriptionTeam) || !validMembers(usersId)) return invalid(res);
        try {
            const team = await teamModel.editTeams(id, newNameTeam, descriptionTeam, usersId);
            if (!team) return missing(res);
            res.json({ message: 'Команда успешно изменена', edit: team });
        } catch (error) { return failure(res, error); }
    },

    addUserTeam: async (req, res) => {
        const { id } = req.params;
        const { usersId } = req.body || {};
        if (!validId(id) || !validMembers(usersId)) return invalid(res);
        try {
            const members = await teamModel.addUserTeams(id, usersId);
            if (members === null) return missing(res);
            res.json({ message: 'Пользователи добавлены', team: members });
        } catch (error) { return failure(res, error); }
    },

    delUserTeams: async (req, res) => {
        const { id_team, id_user } = req.params;
        if (!validId(id_team) || !validId(id_user)) return invalid(res);
        try {
            const result = await teamModel.delUserTeam(id_team, id_user);
            if (!result) return missing(res);
            if (!result.rowCount) return res.status(404).json({ message: 'Участник не найден в команде' });
            res.json({ message: 'Пользователь удалён из команды', team: result });
        } catch (error) { return failure(res, error); }
    },

    delTeam: async (req, res) => {
        const { id } = req.params;
        if (!validId(id)) return invalid(res);
        try {
            const result = await teamModel.delTeams(id);
            if (!result) return missing(res);
            res.json({ message: 'Команда успешно удалена', team: result });
        } catch (error) { return failure(res, error); }
    }
};

module.exports = teamController;