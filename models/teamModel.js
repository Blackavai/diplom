const postgree = require("../db");

const teamModel = {
    getAllTeams: async () => {
        const result = await postgree.query("SELECT * FROM teams;");
        return result.rows;
    },

    createTeams: async (nameTeam) => {
        const query = `INSERT INTO teams_name(name_team) VALUES ($1);`;
        const values = [nameTeam];
        const result = await postgree.query(query, values);
        return result.rows[0];
    },

    editTeams: async (id, newNameTeam, descriptionTeam) => {
        const query = `UPDATE teams_name SET name_team = $1, description_team = $2 WHERE id = $3 RETURNING *;`;
        const values = [newNameTeam, descriptionTeam, id];
        const result = await postgree.query(query, values);
        return result.rows[0];
    },

    addUserTeams: async (id, usersId) => {
        const results = [];
        for (const id_user of usersId) {
            const query = `INSERT INTO teams (id_team_name, id_user) VALUES ($1, $2) RETURNING *`; // Используем RETURNING для получения добавленных записей
            const values = [id, id_user];
            const result = await postgree.query(query, values);
            results.push(result.rows[0]);
        }
        return results;
    },

    delTeams: async (id) => {
        const result = await postgree.query("DELETE FROM teams_name WHERE id = $1;", [id]);
        if(result)
        {
            const result_user_team = await postgree.query("DELETE FROM teams WHERE id_team_name = $1;", [id]);
            return result_user_team;
        } else {
            return result;
        }
    }
};

module.exports = teamModel;