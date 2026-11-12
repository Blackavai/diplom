const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

test('access-control matrix and atomic reports on synthetic PostgreSQL', {
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
    app.use(require('cors')({ origin: 'http://localhost:8080', credentials: true }));
    app.use(express.json());
    for (const name of ['auth', 'user', 'team', 'task', 'report']) {
        app.use(`/api/${name === 'auth' ? name : name + 's'}`, require(`../routes/${name}Routes`));
    }
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    let sequence = 0;
    async function user(role = 2) {
        const tg = `access-user-${++sequence}`;
        const result = await pool.query(`INSERT INTO users (fname,lname,tg_id,role,post,password,question,answer)
            VALUES ('Access','Test',$1,$2,'Test','synthetic-pass','Synthetic question','synthetic-answer') RETURNING id`, [tg, role]);
        const id = result.rows[0].id;
        return { id, tg_id: tg, role, token: jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1h' }) };
    }
    const manager = await user(1);
    const worker = await user();
    const other = await user();
    async function request(method, path, actor, body, headers = {}) {
        const response = await fetch(base + path, {
            method, headers: { 'Content-Type': 'application/json',
                ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}), ...headers },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        const text = await response.text();
        let data;
        try { data = JSON.parse(text); } catch { data = text; }
        return { status: response.status, data, headers: response.headers };
    }
    async function task(owner) {
        return (await pool.query(`INSERT INTO task_list(content,id_user,start_date,end_date,status)
            VALUES ('access-test-task',$1,'2098-01-01','2099-01-01',false) RETURNING id`, [owner.id])).rows[0].id;
    }
    const ownTask = await task(worker);
    const foreignTask = await task(other);
    const managerTask = await task(manager);
    const postReport = (actor, id, extra = {}) => request('POST', '/api/reports/new', actor, {
        id_task: id, text_report: 'Synthetic report', end_date: '2099-01-01', ...extra
    });
    async function snapshot() {
        const result = {};
        for (const table of ['users', 'teams_name', 'teams', 'task_list', 'report_list', 'vacation']) {
            // The first-stage tests may run in parallel; their users are excluded.
            const where = table === 'users' ? "WHERE tg_id LIKE 'access-%'" : '';
            result[table] = (await pool.query(`SELECT jsonb_agg(t ORDER BY id) AS data FROM ${table} t ${where}`)).rows[0].data;
        }
        return result;
    }
    const managerRoutes = [
        ['POST', '/api/auth/createUser'], ['DELETE', `/api/auth/delUser/${other.id}`],
        ['GET', '/api/users'], ['POST', `/api/users/update/${other.id}`], ['GET', `/api/users/delete/${other.id}`],
        ['POST', `/api/users/vacation/${other.id}`], ['GET', '/api/users/vacation/view'],
        ['GET', '/api/teams'], ['POST', '/api/teams/create'], ['PUT', '/api/teams/edit/1'],
        ['DELETE', '/api/teams/delete/1'], ['GET', '/api/teams/view/1'],
        ['POST', '/api/teams/newUserTeam/1'], ['POST', `/api/teams/delUserTeam/1/${other.id}`],
        ['GET', '/api/tasks'], ['POST', '/api/tasks/new'], ['PUT', `/api/tasks/update/${foreignTask}`],
        ['DELETE', `/api/tasks/delete/${foreignTask}`], ['GET', '/api/reports'], ['PUT', '/api/reports/accept/1']
    ];
    const protectedRoutes = [...managerRoutes,
        ...['team', 'tasks', 'vacation'].map((part) => ['GET', `/api/users/${worker.id}/${part}`]),
        ['POST', '/api/reports/new'], ['GET', '/api/auth/protected']
    ];

    await t.test('every protected route rejects anonymous, forged and expired tokens without writes', async () => {
        const before = await snapshot();
        const invalid = [null, { token: 'forged' }, { token: jwt.sign({ id: worker.id }, process.env.JWT_SECRET, { expiresIn: -1 }) }];
        for (const actor of invalid) {
            for (const [method, path] of protectedRoutes) {
                const response = await request(method, path, actor, ['GET', 'DELETE'].includes(method) ? undefined : {});
                assert.equal(response.status, 401, `${method} ${path}`);
            }
        }
        assert.deepEqual(await snapshot(), before);
    });

    await t.test('worker cannot call management routes even with forged role/id cookies', async () => {
        const before = await snapshot();
        for (const [method, path] of managerRoutes) {
            const response = await request(method, path, worker, ['GET', 'DELETE'].includes(method) ? undefined : { role: 1, id_user: manager.id }, {
                Cookie: `userData=${encodeURIComponent(JSON.stringify({ id: manager.id, role: 1 }))}`
            });
            assert.equal(response.status, 403, `${method} ${path}`);
        }
        assert.deepEqual(await snapshot(), before);
    });

    await t.test('own details are allowed; foreign details denied; manager can read either', async () => {
        for (const part of ['team', 'tasks', 'vacation']) {
            assert.equal((await request('GET', `/api/users/${worker.id}/${part}`, worker)).status, 201);
            assert.equal((await request('GET', `/api/users/${other.id}/${part}`, worker)).status, 403);
            assert.equal((await request('GET', `/api/users/${other.id}/${part}`, manager)).status, 201);
        }
        for (const id of ['0', '-1', '1e2', 'abc', '2147483648']) {
            assert.equal((await request('GET', `/api/users/${id}/tasks`, worker)).status, 400);
        }
    });

    await t.test('protected returns only current safe DB fields, ignoring cookie claims', async () => {
        const response = await request('GET', '/api/auth/protected', worker, undefined, {
            Cookie: 'token=forged; userData=%7B%22role%22%3A1%7D'
        });
        assert.equal(response.status, 200);
        assert.equal(response.data.user.id, worker.id);
        assert.equal(response.data.user.role, 2);
        assert.deepEqual(Object.keys(response.data.user).sort(), ['fname', 'id', 'lname', 'post', 'role', 'tg_id']);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal((await request('GET', '/api/auth/protected', null, undefined, { Cookie: `token=${worker.token}` })).status, 401);
    });

    await t.test('invalid signatures, algorithms, IDs, missing expiry and removed users fail closed', async () => {
        const missing = await user();
        await pool.query('DELETE FROM users WHERE id=$1', [missing.id]);
        const tokens = [missing.token,
            jwt.sign({ id: worker.id }, 'synthetic-wrong-secret', { expiresIn: '1h' }),
            jwt.sign({ id: worker.id }, process.env.JWT_SECRET, { algorithm: 'HS384', expiresIn: '1h' }),
            jwt.sign({ id: worker.id }, process.env.JWT_SECRET),
            jwt.sign({ id: String(worker.id) }, process.env.JWT_SECRET, { expiresIn: '1h' }),
            jwt.sign({ id: -1 }, process.env.JWT_SECRET, { expiresIn: '1h' })
        ];
        for (const token of tokens) assert.equal((await request('GET', '/api/auth/protected', { token })).status, 401);
    });

    await t.test('role changes in DB take effect with an already-issued token', async () => {
        const actor = await user(1);
        assert.equal((await request('GET', '/api/users', actor)).status, 200);
        await pool.query('UPDATE users SET role=2 WHERE id=$1', [actor.id]);
        assert.equal((await request('GET', '/api/users', actor)).status, 403);
        assert.equal((await request('GET', '/api/auth/protected', actor)).data.user.role, 2);
    });

    await t.test('login cannot issue a JWT for null, missing or non-string passwords', async () => {
        const actor = await user();
        await pool.query('UPDATE users SET password=NULL WHERE id=$1', [actor.id]);
        for (const password of [null, undefined, '', ' ', [], {}, 123]) {
            const response = await request('POST', '/api/auth/login', null, { tg_id: actor.tg_id, password });
            assert.equal(response.status, 400);
            assert.equal(response.data.user, undefined);
        }
        assert.equal((await request('POST', '/api/auth/login', null, { tg_id: actor.tg_id, password: 'synthetic-pass' })).status, 400);
    });

    await t.test('unknown DB role is denied and DB errors do not become invalid-session responses', async (subtest) => {
        const AuthModel = require('../models/authModel');
        subtest.mock.method(AuthModel, 'findUserById', async () => ({ id: worker.id, role: 99 }));
        assert.equal((await request('GET', '/api/users', worker)).status, 403);
        AuthModel.findUserById = async () => { throw new Error('synthetic-private-SQL'); };
        const response = await request('GET', '/api/users', worker);
        assert.equal(response.status, 500);
        assert.deepEqual(response.data, { message: 'Ошибка сервера' });
    });

    await t.test('reports cannot complete a foreign task, even for managers', async () => {
        const before = await snapshot();
        assert.equal((await postReport(worker, foreignTask, { id_user: other.id })).status, 404);
        assert.equal((await postReport(manager, foreignTask, { id_user: other.id })).status, 404);
        assert.equal((await postReport(worker, 2147483647)).status, 404);
        assert.deepEqual(await snapshot(), before);
    });

    await t.test('author comes from session; successful report and completion commit together', async () => {
        assert.equal((await postReport(worker, ownTask, { id_user: other.id })).status, 200);
        const report = await pool.query('SELECT id_user FROM report_list WHERE id_task=$1', [ownTask]);
        assert.equal(Number(report.rows[0].id_user), worker.id);
        assert.equal((await pool.query('SELECT status FROM task_list WHERE id=$1', [ownTask])).rows[0].status, true);
        assert.equal((await postReport(manager, managerTask)).status, 200);
    });

    await t.test('SQL failure after INSERT rolls back the report and leaves task incomplete', async () => {
        const id = await task(worker);
        await pool.query("UPDATE task_list SET content='access-force-update-error' WHERE id=$1", [id]);
        await pool.query(`CREATE FUNCTION access_fail_task_update() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN IF NEW.content = 'access-force-update-error' THEN RAISE EXCEPTION 'synthetic-private-error'; END IF; RETURN NEW; END $$`);
        await pool.query(`CREATE TRIGGER access_task_failure BEFORE UPDATE ON task_list
            FOR EACH ROW EXECUTE FUNCTION access_fail_task_update()`);
        try {
            assert.equal((await postReport(worker, id)).status, 500);
            assert.equal((await pool.query('SELECT count(*)::int AS n FROM report_list WHERE id_task=$1', [id])).rows[0].n, 0);
            assert.equal((await pool.query('SELECT status FROM task_list WHERE id=$1', [id])).rows[0].status, false);
        } finally {
            await pool.query('DROP TRIGGER access_task_failure ON task_list');
            await pool.query('DROP FUNCTION access_fail_task_update()');
        }
    });

    await t.test('parallel own reports preserve existing multiple-report behavior and consistent completion', async () => {
        const id = await task(worker);
        const results = await Promise.all([postReport(worker, id), postReport(worker, id)]);
        assert.deepEqual(results.map((r) => r.status), [200, 200]);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM report_list WHERE id_task=$1', [id])).rows[0].n, 2);
        assert.equal((await pool.query('SELECT status FROM task_list WHERE id=$1', [id])).rows[0].status, true);
    });

    await t.test('report validation rejects malformed values before writing', async () => {
        const before = await snapshot();
        for (const extra of [{ id_task: null }, { id_task: '1e2' }, { text_report: '' }, { text_report: 'x'.repeat(256) }, { end_date: 'invalid' }]) {
            assert.equal((await postReport(worker, ownTask, extra)).status, 400);
        }
        assert.deepEqual(await snapshot(), before);
    });

    await t.test('manager management workflows remain available across all resource groups', async () => {
        assert.equal((await request('GET', '/api/users', manager)).status, 200);
        const created = await request('POST', '/api/auth/createUser', manager, {
            fname: 'Created', lname: 'Test', tg_id: 'access-created', role: 2, post: 'Test', pass: 'synthetic-pass'
        });
        assert.equal(created.status, 201);
        const id = (await pool.query("SELECT id FROM users WHERE tg_id='access-created'")).rows[0].id;
        assert.equal((await request('POST', `/api/users/update/${id}`, manager, { fname: 'Changed', lname: 'Test', post: 'Test' })).status, 201);
        assert.equal((await request('POST', '/api/tasks/new', manager, {
            content: 'access-created-task', id_user: id, start_date: '2098-01-01', end_date: '2099-01-01'
        })).status, 200);
        const taskId = (await pool.query('SELECT id FROM task_list WHERE id_user=$1', [id])).rows[0].id;
        assert.equal((await request('PUT', `/api/tasks/update/${taskId}`, manager, { content: 'Changed', date: '2099-02-01', status: false })).status, 200);
        assert.equal((await request('GET', '/api/tasks', manager)).status, 200);
        assert.equal((await request('DELETE', `/api/tasks/delete/${taskId}`, manager)).status, 200);
        const team = await request('POST', '/api/teams/create', manager, { nameTeam: 'Access test team', descriptionTeam: 'Test' });
        assert.equal(team.status, 200);
        const teamId = team.data.task.id;
        assert.equal((await request('POST', `/api/teams/newUserTeam/${teamId}`, manager, { usersId: [id] })).status, 200);
        assert.equal((await request('GET', '/api/teams', manager)).status, 200);
        assert.equal((await request('GET', `/api/teams/view/${teamId}`, manager)).status, 200);
        assert.equal((await request('PUT', `/api/teams/edit/${teamId}`, manager, { newNameTeam: 'Changed', descriptionTeam: 'Test' })).status, 200);
        assert.equal((await request('POST', `/api/teams/delUserTeam/${teamId}/${id}`, manager, {})).status, 200);
        // A11 is deliberately outside this stage: remove membership through its existing API before deleting an empty team.
        assert.equal((await request('DELETE', `/api/teams/delete/${teamId}`, manager)).status, 200);
        assert.equal((await request('DELETE', `/api/auth/delUser/${id}`, manager)).status, 201);
        const disposable = await user();
        assert.equal((await request('GET', `/api/users/delete/${disposable.id}`, manager)).status, 201);
        assert.equal((await request('POST', `/api/users/vacation/${other.id}`, manager, { startHoliday: '2098-01-01', endHoliday: '2098-01-02' })).status, 201);
        assert.equal((await request('GET', '/api/users/vacation/view', manager)).status, 201);
        const reports = await request('GET', '/api/reports', manager);
        assert.equal(reports.status, 200);
        assert.ok(reports.data.length > 0);
        assert.equal((await request('PUT', `/api/reports/accept/${reports.data[0].id}`, manager)).status, 200);
    });

    await t.test('Bearer preflight works for the existing permitted browser origin', async () => {
        const result = await request('OPTIONS', '/api/users', null, undefined, {
            Origin: 'http://localhost:8080', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization'
        });
        assert.equal(result.status, 204);
        assert.equal(result.headers.get('access-control-allow-origin'), 'http://localhost:8080');
        assert.equal(result.headers.get('access-control-allow-headers'), 'authorization');
    });
});
