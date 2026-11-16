const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

test('task API contract on synthetic PostgreSQL', { skip: process.env.RECOVERY_TEST_DATABASE !== '1' }, async (t) => {
    assert.equal(process.env.NODE_ENV, 'test');
    assert.equal(process.env.DB_HOST, 'recovery-db');
    assert.equal(process.env.DB_NAME, 'dailysync_recovery_test');
    assert.equal(process.env.DB_USER, 'recovery_test');
    const pool = require('../db');
    t.after(() => pool.end());
    assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name, 'dailysync_recovery_test');
    const express = require('express');
    const jwt = require('jsonwebtoken');
    const TaskModel = require('../models/taskModel');
    const AuthModel = require('../models/authModel');
    const { apiNotFound, apiErrorHandler } = require('../middleware/errorMiddleware');
    const app = express();
    app.use(express.json());
    app.use('/api/tasks', require('../routes/taskRoutes'));
    app.use('/api', apiNotFound);
    app.use(apiErrorHandler);
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise(resolve => server.close(resolve)));
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    let sequence = 0;
    async function user(role = 2) {
        return (await pool.query("INSERT INTO users(fname,lname,tg_id,post,role) VALUES ('Tasks','Test',$1,'Test',$2) RETURNING id",
            ['tasks-contract-' + (++sequence), role])).rows[0].id;
    }
    const manager = await user(1);
    const worker = await user();
    const other = await user();
    const token = id => jwt.sign({ id, sessionVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const managerToken = token(manager);
    const workerToken = token(worker);
    async function makeTask(owner = worker, content = 'Synthetic existing task') {
        return (await pool.query("INSERT INTO task_list(content,id_user,start_date,end_date,status) VALUES ($1,$2,'2026-01-01','2099-01-01',false) RETURNING id",
            [content, owner])).rows[0].id;
    }
    const taskId = await makeTask();
    const validCreate = () => ({ content: 'Synthetic created task', id_user: worker, start_date: '2026-11-16', end_date: '2026-11-17' });
    const validUpdate = () => ({ content: 'Synthetic updated task', end_date: '2026-11-18', status: false });
    async function request(method, path, body, bearer = managerToken) {
        const response = await fetch(base + path, {
            method, headers: { 'Content-Type': 'application/json', 'X-Auth-Mode': 'bearer', ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        const raw = await response.text();
        let data;
        try { data = JSON.parse(raw); } catch { data = raw; }
        return { status: response.status, data, raw, headers: response.headers };
    }
    const create = body => request('POST', '/api/tasks/new', body);
    const update = (body, id = taskId) => request('PUT', '/api/tasks/update/' + id, body);
    const remove = id => request('DELETE', '/api/tasks/delete/' + id);
    async function snapshot() {
        const result = {};
        for (const table of ['users', 'teams_name', 'teams', 'task_list', 'report_list', 'vacation']) {
            result[table] = (await pool.query('SELECT * FROM ' + table + ' ORDER BY id')).rows;
        }
        return result;
    }
    async function storedTask(id) {
        return (await pool.query("SELECT *,to_char(start_date,'YYYY-MM-DD') AS start_day,to_char(end_date,'YYYY-MM-DD') AS end_day FROM task_list WHERE id=$1", [id])).rows[0];
    }

    await t.test('creation, update and deletion remain manager-only before validation', async () => {
        const before = await snapshot();
        for (const bearer of [null, workerToken]) {
            for (const [method, path] of [['POST', '/api/tasks/new'], ['PUT', '/api/tasks/update/' + taskId], ['DELETE', '/api/tasks/delete/' + taskId]]) {
                assert.equal((await request(method, path, method === 'DELETE' ? undefined : {}, bearer)).status, bearer ? 403 : 401);
            }
        }
        assert.deepEqual(await snapshot(), before);
    });

    await t.test('invalid creation text, IDs and bodies fail before business queries', async (subtest) => {
        const before = await snapshot();
        subtest.mock.method(TaskModel, 'checkVacationUser', () => { throw new Error('Invalid input reached business query'); });
        subtest.mock.method(TaskModel, 'addNewTasks', () => { throw new Error('Invalid input reached INSERT'); });
        for (const content of [undefined, null, '', ' \t ', 12, true, [], {}, 'x'.repeat(256), '😀'.repeat(256), 'x\0y', '\ud800', '\udfff']) {
            assert.equal((await create({ ...validCreate(), content })).status, 400);
        }
        for (const id_user of [undefined, null, '', ' ', 0, -1, 1.5, true, [], {}, '01', '1e2', '+1', 2147483648, '2147483648']) {
            assert.equal((await create({ ...validCreate(), id_user })).status, 400);
        }
        for (const body of [undefined, {}, [], null]) assert.equal((await create(body)).status, 400);
        assert.deepEqual(await snapshot(), before);
    });

    await t.test('invalid dates fail before business queries in either creation field', async (subtest) => {
        const before = await snapshot();
        subtest.mock.method(TaskModel, 'checkVacationUser', () => { throw new Error('Invalid date reached model'); });
        for (const field of ['start_date', 'end_date']) {
            for (const value of [undefined, null, 123, [], {}, '', '2026-02-30', '1900-02-29', '0000-01-01', '10000-01-01',
                '2026-13-01', '2026-01-00', '16.11.2026', ' 2026-11-16', '2026-11-16T24:00:00Z',
                '2026-11-16T12:00:00', '2026-11-16T12:00:00+16:00', '2026-11-16T12:00:00.' + '1'.repeat(21) + 'Z']) {
                assert.equal((await create({ ...validCreate(), [field]: value })).status, 400, field + ': ' + String(value));
            }
        }
        assert.deepEqual(await snapshot(), before);
    });

    await t.test('created record is returned and Unicode, spaces and recipient persist unchanged', async () => {
        for (const content of ['😀'.repeat(255), '𠮷'.repeat(255), 'e\u0301'.repeat(127) + 'x', "  Synthetic ' text  "]) {
            const response = await create({ ...validCreate(), content, id_user: String(worker), status: true, id: 2147483647, role: 1 });
            assert.equal(response.status, 200);
            assert.equal(response.headers.get('cache-control'), 'no-store');
            assert.equal(response.data.checkVacation, false);
            assert.deepEqual(Object.keys(response.data.task).sort(), ['content', 'end_date', 'id', 'id_user', 'start_date', 'status']);
            assert.equal(response.data.task.content, content);
            assert.equal(typeof response.data.task.id_user, 'string');
            assert.equal(Number(response.data.task.id_user), worker);
            assert.equal(response.data.task.status, false);
            const stored = await storedTask(response.data.task.id);
            assert.equal(stored.content, content);
            assert.equal(Number(stored.id_user), worker);
            assert.equal(stored.start_day, '2026-11-16');
            assert.equal(stored.end_day, '2026-11-17');
            assert.equal(stored.status, false);
        }
    });

    await t.test('date boundaries, leap day and current frontend ISO timestamps preserve calendar parts', async () => {
        for (const [start_date, end_date] of [
            ['0001-01-01', '9999-12-31'],
            ['2000-02-29', '2028-02-29'],
            ['2026-11-16T23:59:59.999Z', '2026-11-17T00:00:00+03:00'],
            ['2026-11-16T12:00:00+15:59', '2026-11-17T12:00:00.1234567891234567Z']
        ]) {
            const response = await create({ ...validCreate(), start_date, end_date });
            assert.equal(response.status, 200);
            const stored = await storedTask(response.data.task.id);
            assert.equal(stored.start_day, start_date.slice(0, 10));
            assert.equal(stored.end_day, end_date.slice(0, 10));
        }
    });

    await t.test('a missing recipient returns 404 before vacation/INSERT and without changing rows', async (subtest) => {
        const before = await snapshot();
        subtest.mock.method(TaskModel, 'checkVacationUser', () => { throw new Error('Missing user reached vacation query'); });
        for (const id_user of [2147483647, '2147483647']) {
            const response = await create({ ...validCreate(), id_user });
            assert.equal(response.status, 404);
            assert.deepEqual(response.data, { message: 'Сотрудник не найден' });
        }
        assert.deepEqual(await snapshot(), before);
    });

    await t.test('recipient deletion between check and INSERT returns 404, preserving other data', async (subtest) => {
        const recipient = await user();
        const before = await snapshot();
        subtest.mock.method(TaskModel, 'checkVacationUser', async id => {
            assert.equal(id, recipient);
            await pool.query('DELETE FROM users WHERE id=$1', [id]);
            return false;
        });
        const response = await create({ ...validCreate(), id_user: recipient });
        assert.equal(response.status, 404);
        const after = await snapshot();
        assert.deepEqual(after, { ...before, users: before.users.filter(row => row.id !== recipient) });
    });

    await t.test('the existing current-vacation block remains 200 with no new task', async () => {
        const recipient = await user();
        await pool.query('INSERT INTO vacation(id_user,start_holiday,end_holiday) VALUES ($1,CURRENT_DATE-2,CURRENT_DATE+2)', [recipient]);
        const before = await snapshot();
        const response = await create({ ...validCreate(), id_user: recipient });
        assert.equal(response.status, 200);
        assert.deepEqual(response.data, { message: 'Сотрудник в отпуске', checkVacation: true });
        assert.deepEqual(await snapshot(), before);
    });

    await t.test('future vacation and reversed task dates retain the previous rules', async () => {
        const recipient = await user();
        await pool.query('INSERT INTO vacation(id_user,start_holiday,end_holiday) VALUES ($1,CURRENT_DATE+10,CURRENT_DATE+11)', [recipient]);
        const response = await create({ ...validCreate(), id_user: recipient, start_date: '2099-02-01', end_date: '2099-01-01' });
        assert.equal(response.status, 200);
        assert.equal(response.data.checkVacation, false);
    });

    await t.test('documented end_date and legacy date both update; false status and ownership remain intact', async () => {
        const before = await storedTask(taskId);
        for (const body of [
            { content: '  Changed  ', end_date: '2026-11-18', status: true },
            { content: '😀'.repeat(255), date: '2026-11-19T00:00:00Z', status: false },
            { content: 'Both date names', end_date: '2026-11-20', date: '2026-11-20T23:59:59-03:00', status: false }
        ]) {
            const response = await update({ ...body, id_user: other, start_date: '1900-01-01', id: 2147483647 });
            assert.equal(response.status, 200);
            assert.equal(response.data.id, taskId);
            assert.equal(response.data.content, body.content);
            assert.equal(response.data.status, body.status);
            const stored = await storedTask(taskId);
            assert.equal(stored.end_day, (body.end_date || body.date).slice(0, 10));
            assert.equal(stored.id_user, before.id_user);
            assert.equal(stored.start_day, before.start_day);
        }
    });

    await t.test('OpenAPI describes the actual creation and full-update contracts', async () => {
        const spec = require('swagger-jsdoc')({
            definition: { openapi: '3.0.0', info: { title: 'Synthetic tasks contract', version: '1' } },
            apis: [require('node:path').join(__dirname, '../routes/*.js')],
            failOnErrors: true
        });
        const creation = spec.paths['/api/tasks/new'].post;
        const creationBody = creation.requestBody.content['application/json'].schema;
        assert.deepEqual(creationBody.required, ['content', 'id_user', 'start_date', 'end_date']);
        assert.equal(creation.responses['200'].content['application/json'].schema.properties.checkVacation.type, 'boolean');
        const changing = spec.paths['/api/tasks/update/{id}'].put;
        const changingBody = changing.requestBody.content['application/json'].schema;
        assert.deepEqual(changingBody.required, ['content', 'status']);
        assert.deepEqual(changingBody.anyOf, [{ required: ['end_date'] }, { required: ['date'] }]);
        assert.ok(changing.responses['400']);
        assert.ok(changing.responses['404']);
        assert.equal(spec.components.schemas.Task.properties.id_user.type, 'string');
        assert.equal(spec.components.schemas.TaskDateInput.maxLength, 40);
        assert.equal((await update({ ...validUpdate(), end_date: spec.components.schemas.TaskDateInput.example })).status, 200);
    });

    await t.test('missing task update returns 404 and invalid fields/IDs never call UPDATE', async (subtest) => {
        const before = await snapshot();
        const missing = await update(validUpdate(), 2147483647);
        assert.equal(missing.status, 404);
        assert.deepEqual(missing.data, { error: 'Задача не найдена' });
        subtest.mock.method(TaskModel, 'updateTask', () => { throw new Error('Invalid update reached SQL'); });
        for (const id of ['0', '-1', '01', '1.5', '1e2', 'abc', '2147483648']) {
            assert.equal((await update(validUpdate(), id)).status, 400);
        }
        for (const content of [undefined, null, '', ' ', 1, [], {}, 'x'.repeat(256), '😀'.repeat(256), 'x\0y', '\ud800']) {
            assert.equal((await update({ ...validUpdate(), content })).status, 400);
        }
        for (const status of [undefined, null, 0, 1, 'true', 'false', [], {}]) {
            assert.equal((await update({ ...validUpdate(), status })).status, 400);
        }
        for (const body of [undefined, {}, [], null, { content: 'Incomplete', status: false }]) {
            assert.equal((await update(body)).status, 400);
        }
        for (const dates of [
            { end_date: undefined }, { end_date: '2026-02-30' }, { date: '2026-02-30' },
            { end_date: '2026-11-18', date: '2026-11-19' }, { end_date: '2026-11-18', date: null },
            { end_date: null, date: '2026-11-18' }, { end_date: [], date: '2026-11-18' }
        ]) {
            const body = { content: 'Dates', status: false, ...dates };
            assert.equal((await update(body)).status, 400);
        }
        assert.deepEqual(await snapshot(), before);
    });

    await t.test('delete validates id and reports 404 when rowCount is zero', async (subtest) => {
        const before = await snapshot();
        for (const id of [2147483647, '2147483647']) {
            const missing = await remove(id);
            assert.equal(missing.status, 404);
            assert.deepEqual(missing.data, { error: 'Задача не найдена' });
        }
        subtest.mock.method(TaskModel, 'deleteTask', () => { throw new Error('Invalid id reached DELETE'); });
        for (const id of ['0', '-1', '01', '1e2', 'abc', '2147483648']) assert.equal((await remove(id)).status, 400);
        assert.deepEqual(await snapshot(), before);
    });

    await t.test('successful deletion retains QueryResult shape and never deletes another task', async () => {
        const id = await makeTask();
        const before = await snapshot();
        const response = await remove(id);
        assert.equal(response.status, 200);
        assert.equal(response.data.task.command, 'DELETE');
        assert.equal(response.data.task.rowCount, 1);
        assert.deepEqual(response.data.task.rows, []);
        const expected = { ...before, task_list: before.task_list.filter(row => row.id !== id) };
        assert.deepEqual(await snapshot(), expected);
        assert.equal((await remove(id)).status, 404);
        assert.deepEqual(await snapshot(), expected);
    });

    await t.test('deletion with a report still fails safely and preserves history', async (subtest) => {
        const id = await makeTask();
        await pool.query("INSERT INTO report_list(id_task,id_user,text_report,end_date,status_task) VALUES ($1,$2,'Synthetic history','2026-11-16',true)", [id, worker]);
        await pool.query('UPDATE task_list SET status=true WHERE id=$1', [id]);
        const before = await snapshot();
        const logs = [];
        subtest.mock.method(console, 'error', (...args) => logs.push(args));
        const response = await remove(id);
        assert.equal(response.status, 500);
        assert.deepEqual(response.data, { error: 'Ошибка сервера' });
        assert.deepEqual(logs, [['Ошибка удаления задачи']]);
        assert.deepEqual(await snapshot(), before);
    });

    await t.test('a real zero-row INSERT is never reported as success', async (subtest) => {
        const before = await snapshot();
        const logs = [];
        subtest.mock.method(console, 'error', (...args) => logs.push(args));
        await pool.query("CREATE FUNCTION tasks_skip_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.content='tasks-skip-insert' THEN RETURN NULL; END IF; RETURN NEW; END $$");
        await pool.query('CREATE TRIGGER tasks_skip_insert BEFORE INSERT ON task_list FOR EACH ROW EXECUTE FUNCTION tasks_skip_insert()');
        try {
            const response = await create({ ...validCreate(), content: 'tasks-skip-insert' });
            assert.equal(response.status, 500);
            assert.deepEqual(response.data, { error: 'Ошибка сервера' });
            assert.deepEqual(logs, [['Ошибка создания задачи']]);
            assert.deepEqual(await snapshot(), before);
        } finally {
            await pool.query('DROP TRIGGER tasks_skip_insert ON task_list');
            await pool.query('DROP FUNCTION tasks_skip_insert()');
        }
    });

    await t.test('unexpected lookup and SQL failures retain safe legacy 500 without hiding other FK errors', async (subtest) => {
        const before = await snapshot();
        const logs = [];
        subtest.mock.method(console, 'error', (...args) => logs.push(args));
        subtest.mock.method(TaskModel, 'addNewTasks', async () => { throw Object.assign(new Error('private-task-sql'), { code: '23503', detail: 'private-task-detail' }); });
        const response = await create(validCreate());
        assert.equal(response.status, 500);
        assert.deepEqual(response.data, { error: 'Ошибка сервера' });
        assert.deepEqual(logs, [['Ошибка создания задачи']]);
        const findUserById = AuthModel.findUserById;
        subtest.mock.method(AuthModel, 'findUserById', async id => {
            if (id === worker) throw new Error('private-task-lookup');
            return findUserById(id);
        });
        const failedLookup = await create(validCreate());
        assert.equal(failedLookup.status, 500);
        assert.equal(JSON.stringify(logs).includes('private-task'), false);
        assert.deepEqual(await snapshot(), before);
    });
});
