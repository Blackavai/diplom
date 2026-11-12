const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

test('atomic team operations on synthetic PostgreSQL', {
    skip: process.env.RECOVERY_TEST_DATABASE !== '1'
}, async (t) => {
    assert.equal(process.env.NODE_ENV, 'test');
    assert.equal(process.env.DB_HOST, 'recovery-db');
    assert.equal(process.env.DB_NAME, 'dailysync_recovery_test');
    assert.equal(process.env.DB_USER, 'recovery_test');
    const pool = require('../db');
    t.after(() => pool.end());
    assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name, 'dailysync_recovery_test');
    const jwt = require('jsonwebtoken');
    const express = require('express');
    const app = express();
    app.use(express.json());
    app.use('/api/teams', require('../routes/teamRoutes'));
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/api/teams`;
    const ids = [];
    for (let index = 0; index < 4; index++) {
        ids.push((await pool.query(`INSERT INTO users(fname,lname,tg_id,role,post)
            VALUES ('Team','Test',$1,$2,'Test') RETURNING id`, [`teams-test-${index}`, index === 0 ? 1 : 2])).rows[0].id);
    }
    const token = jwt.sign({ id: ids[0] }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const missingUser = 2147483647;
    const request = async (method, path, body) => {
        const response = await fetch(base + path, {
            method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        return { status: response.status, data: await response.json() };
    };
    const create = async (usersId = []) => {
        const result = await request('POST', '/create', { nameTeam: 'Synthetic team', descriptionTeam: '', usersId });
        assert.equal(result.status, 200);
        return result.data.task.id;
    };
    const members = async (id) => (await pool.query('SELECT id_user FROM teams WHERE id_team_name=$1 ORDER BY id_user', [id])).rows.map((row) => Number(row.id_user));
    const teamCount = async () => Number((await pool.query('SELECT count(*) FROM teams_name')).rows[0].count);

    await t.test('creation remains compatible without usersId and supports atomic initial members', async () => {
        const old = await request('POST', '/create', { nameTeam: 'Old client', descriptionTeam: null });
        assert.equal(old.status, 200);
        assert.deepEqual(await members(old.data.task.id), []);
        const id = await create([ids[1], ids[1], ids[2]]);
        assert.deepEqual(await members(id), [ids[1], ids[2]]);
    });

    await t.test('invalid member rolls back creation and metadata editing', async () => {
        const before = await teamCount();
        assert.equal((await request('POST', '/create', { nameTeam: 'Must rollback', usersId: [ids[1], missingUser] })).status, 400);
        assert.equal(await teamCount(), before);
        const id = await create();
        assert.equal((await request('PUT', `/edit/${id}`, { newNameTeam: 'Must rollback', descriptionTeam: 'Changed', usersId: [ids[1], missingUser] })).status, 400);
        assert.deepEqual(await members(id), []);
        assert.equal((await pool.query('SELECT name_team FROM teams_name WHERE id=$1', [id])).rows[0].name_team, 'Synthetic team');
    });

    await t.test('invalid payloads and ids return 400 without writes', async () => {
        const id = await create();
        for (const usersId of [undefined, null, {}, '1', [null], ['1'], [0], [-1], [1.5], [2147483648]]) {
            assert.equal((await request('POST', `/newUserTeam/${id}`, { usersId })).status, 400);
        }
        for (const bad of ['0', '-1', '1.5', 'abc', '2147483648']) {
            assert.equal((await request('DELETE', `/delete/${bad}`)).status, 400);
        }
        const before = await teamCount();
        for (const body of [{}, { nameTeam: ' ' }, { nameTeam: [] }, { nameTeam: 'x'.repeat(256) }, { nameTeam: 'Valid', descriptionTeam: 3 }, { nameTeam: 'Valid', usersId: null }]) {
            assert.equal((await request('POST', '/create', body)).status, 400);
        }
        // PostgreSQL varchar length counts Unicode characters rather than UTF-16 code units.
        assert.equal((await request('POST', '/create', { nameTeam: '😀'.repeat(255) })).status, 200);
        assert.equal(await teamCount(), before + 1);
        assert.deepEqual(await members(id), []);
    });

    await t.test('bulk add is atomic and repeated additions are idempotent', async () => {
        const id = await create([ids[1]]);
        assert.equal((await request('POST', `/newUserTeam/${id}`, { usersId: [ids[2], missingUser] })).status, 400);
        assert.deepEqual(await members(id), [ids[1]]);
        for (let i = 0; i < 2; i++) {
            assert.equal((await request('POST', `/newUserTeam/${id}`, { usersId: [ids[1], ids[2], ids[2]] })).status, 200);
        }
        assert.deepEqual(await members(id), [ids[1], ids[2]]);
        assert.equal((await request('POST', `/newUserTeam/${id}`, { usersId: [] })).status, 200);
    });

    await t.test('parallel add and edit requests do not create duplicate pairs', async () => {
        const id = await create();
        const results = await Promise.all([
            request('POST', `/newUserTeam/${id}`, { usersId: [ids[2], ids[1]] }),
            request('POST', `/newUserTeam/${id}`, { usersId: [ids[1], ids[2]] }),
            request('PUT', `/edit/${id}`, { newNameTeam: 'Edited', usersId: [ids[1], ids[2]] })
        ]);
        assert.ok(results.every((result) => result.status === 200));
        assert.deepEqual(await members(id), [ids[1], ids[2]]);
    });

    await t.test('existing duplicate memberships are preserved, no new duplicates are added', async () => {
        const id = await create([ids[1]]);
        await pool.query('INSERT INTO teams(id_team_name,id_user) VALUES ($1,$2)', [id, ids[1]]);
        assert.equal((await request('POST', `/newUserTeam/${id}`, { usersId: [ids[1], ids[2]] })).status, 200);
        assert.deepEqual(await members(id), [ids[1], ids[1], ids[2]]);
    });

    await t.test('empty and populated teams delete their own memberships only', async () => {
        const empty = await create();
        const populated = await create([ids[1], ids[2]]);
        const other = await create([ids[2]]);
        assert.equal((await request('DELETE', `/delete/${empty}`)).status, 200);
        assert.equal((await request('DELETE', `/delete/${populated}`)).status, 200);
        assert.deepEqual(await members(populated), []);
        assert.deepEqual(await members(other), [ids[2]]);
        assert.equal((await pool.query('SELECT count(*) FROM users WHERE id=ANY($1::int[])', [ids])).rows[0].count, '4');
        assert.equal((await request('DELETE', `/delete/${populated}`)).status, 404);
    });

    await t.test('real SQL failure after membership deletion restores the team and memberships', async () => {
        const id = await create([ids[1], ids[2]]);
        await pool.query(`CREATE FUNCTION stage4_deny_team_delete() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'synthetic deletion failure'; END $$;
            CREATE TRIGGER stage4_deny_team_delete BEFORE DELETE ON teams_name FOR EACH ROW EXECUTE FUNCTION stage4_deny_team_delete()`);
        try {
            assert.equal((await request('DELETE', `/delete/${id}`)).status, 500);
            assert.deepEqual(await members(id), [ids[1], ids[2]]);
            assert.equal((await pool.query('SELECT id FROM teams_name WHERE id=$1', [id])).rowCount, 1);
        } finally {
            await pool.query('DROP TRIGGER stage4_deny_team_delete ON teams_name; DROP FUNCTION stage4_deny_team_delete()');
        }
    });

    await t.test('real member INSERT failure rolls back creation, edit and bulk add', async () => {
        const id = await create([ids[1]]);
        const before = await teamCount();
        await pool.query(`CREATE FUNCTION stage4_deny_member() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN IF NEW.id_user = ${ids[3]} THEN RAISE EXCEPTION 'synthetic insertion failure'; END IF; RETURN NEW; END $$;
            CREATE TRIGGER stage4_deny_member BEFORE INSERT ON teams FOR EACH ROW EXECUTE FUNCTION stage4_deny_member()`);
        try {
            assert.equal((await request('POST', '/create', { nameTeam: 'Must rollback', usersId: [ids[2], ids[3]] })).status, 500);
            assert.equal(await teamCount(), before);
            assert.equal((await request('PUT', `/edit/${id}`, { newNameTeam: 'Must rollback', usersId: [ids[2], ids[3]] })).status, 500);
            assert.equal((await request('POST', `/newUserTeam/${id}`, { usersId: [ids[2], ids[3]] })).status, 500);
            assert.deepEqual(await members(id), [ids[1]]);
            assert.equal((await pool.query('SELECT name_team FROM teams_name WHERE id=$1', [id])).rows[0].name_team, 'Synthetic team');
        } finally {
            await pool.query('DROP TRIGGER stage4_deny_member ON teams; DROP FUNCTION stage4_deny_member()');
        }
    });

    await t.test('missing teams and memberships return 404', async () => {
        assert.equal((await request('POST', `/newUserTeam/${missingUser}`, { usersId: [ids[1]] })).status, 404);
        assert.equal((await request('PUT', `/edit/${missingUser}`, { newNameTeam: 'Missing' })).status, 404);
        assert.equal((await request('POST', `/delUserTeam/${missingUser}/${ids[1]}`, {})).status, 404);
        const id = await create([ids[1]]);
        assert.equal((await request('POST', `/delUserTeam/${id}/${ids[1]}`, {})).status, 200);
        assert.equal((await request('POST', `/delUserTeam/${id}/${ids[1]}`, {})).status, 404);
    });

    await t.test('concurrent deletion and addition leave no orphan memberships', async () => {
        const id = await create([ids[1]]);
        const results = await Promise.all([
            request('DELETE', `/delete/${id}`),
            request('POST', `/newUserTeam/${id}`, { usersId: [ids[2]] })
        ]);
        assert.equal(results[0].status, 200);
        assert.ok([200, 404].includes(results[1].status));
        assert.deepEqual(await members(id), []);
    });
});
