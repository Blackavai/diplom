const postgree = require('../db');

async function transaction(operation) {
    const client = await postgree.connect();
    try {
        await client.query('BEGIN');
        const result = await operation(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// Every membership writer in this application locks the parent team first.
// This serializes duplicate checks without changing existing data or the schema.
async function addMembers(client, id, usersId) {
    const ids = [...new Set(usersId)].sort((a, b) => a - b);
    if (!ids.length) return [];
    const users = await client.query(
        'SELECT id FROM users WHERE id = ANY($1::int[]) ORDER BY id FOR KEY SHARE', [ids]
    );
    if (users.rowCount !== ids.length) {
        const error = new Error('Один или несколько пользователей не найдены');
        error.status = 400;
        throw error;
    }
    const result = await client.query(`
        INSERT INTO teams (id_team_name, id_user)
        SELECT $1, member_id FROM unnest($2::int[]) AS member_id
        WHERE NOT EXISTS (
            SELECT 1 FROM teams WHERE id_team_name = $1 AND id_user = member_id
        ) RETURNING *`, [id, ids]);
    return result.rows;
}

const lockTeam = async (client, id) =>
    (await client.query('SELECT id FROM teams_name WHERE id = $1 FOR UPDATE', [id])).rowCount > 0;

const teamModel = {
    getAllTeams: async () => {
        const result = await postgree.query('SELECT * FROM teams_name ORDER BY id;');
        return result.rows;
    },

    createTeams: (nameTeam, descriptionTeam, usersId = []) => transaction(async (client) => {
        const result = await client.query(
            'INSERT INTO teams_name(name_team, description_team) VALUES ($1, $2) RETURNING id',
            [nameTeam, descriptionTeam]
        );
        await addMembers(client, result.rows[0].id, usersId);
        return result.rows[0];
    }),

    viewTeams: async (id) => {
        const result = await postgree.query(`SELECT users.fname, users.lname, users.id
            FROM users INNER JOIN teams ON users.id = teams.id_user
            WHERE teams.id_team_name = $1 ORDER BY teams.id`, [id]);
        return result.rows;
    },

    editTeams: (id, newNameTeam, descriptionTeam, usersId = []) => transaction(async (client) => {
        if (!await lockTeam(client, id)) return null;
        const result = await client.query(
            'UPDATE teams_name SET name_team = $1, description_team = $2 WHERE id = $3 RETURNING *',
            [newNameTeam, descriptionTeam, id]
        );
        await addMembers(client, id, usersId);
        return result.rows[0];
    }),

    addUserTeams: (id, usersId) => transaction(async (client) => {
        if (!await lockTeam(client, id)) return null;
        return addMembers(client, id, usersId);
    }),

    delUserTeam: (id_team, id_user) => transaction(async (client) => {
        if (!await lockTeam(client, id_team)) return null;
        return client.query('DELETE FROM teams WHERE id_team_name = $1 AND id_user = $2', [id_team, id_user]);
    }),

    delTeams: (id) => transaction(async (client) => {
        if (!await lockTeam(client, id)) return null;
        const members = await client.query('DELETE FROM teams WHERE id_team_name = $1', [id]);
        await client.query('DELETE FROM teams_name WHERE id = $1', [id]);
        // Preserve the existing response's QueryResult shape.
        return members;
    })
};

module.exports = teamModel;