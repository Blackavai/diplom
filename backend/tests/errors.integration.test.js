const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { gzipSync } = require('node:zlib');

test('safe API errors and controller logging on synthetic PostgreSQL', {
    skip: process.env.RECOVERY_TEST_DATABASE !== '1'
}, async (t) => {
    assert.equal(process.env.NODE_ENV, 'test');
    assert.equal(process.env.DB_HOST, 'recovery-db');
    assert.equal(process.env.DB_NAME, 'dailysync_recovery_test');
    assert.equal(process.env.DB_USER, 'recovery_test');
    const pool = require('../db');
    t.after(() => pool.end());
    assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name, 'dailysync_recovery_test');

    const express = require('express');
    const jwt = require('jsonwebtoken');
    const AuthModel = require('../models/authModel');
    const UserModel = require('../models/userModel');
    const TaskModel = require('../models/taskModel');
    const ReportModel = require('../models/reportModel');
    const { apiNotFound, apiErrorHandler } = require('../middleware/errorMiddleware');
    const marker = 'synthetic-private-error-value';
    const privateError = () => Object.assign(new Error(marker), {
        detail: marker, query: marker, parameters: [marker], code: '23503',
        body: { password: marker }, headers: { Authorization: marker }
    });
    const logs = [];
    t.beforeEach((subtest) => {
        logs.length = 0;
        subtest.mock.method(console, 'error', (...args) => logs.push(args));
    });

    const app = express();
    app.use(express.json());
    for (const name of ['auth', 'user', 'task', 'team', 'report']) {
        app.use('/api/' + (name === 'auth' ? name : name + 's'), require('../routes/' + name + 'Routes'));
    }
    // Эти маршруты существуют только внутри теста, чтобы вызвать необработанные исключения.
    app.post('/api/error-fixture/echo', (req, res) => res.sendStatus(204));
    app.get('/api/error-fixture/rejected', async () => { throw privateError(); });
    app.get('/api/error-fixture/thrown', () => { throw marker; });
    app.get('/api/error-fixture/status', () => { throw Object.assign(privateError(), { status: 418, expose: true }); });
    app.get('/api/error-fixture/partial', (req, res) => {
        res.write('{"partial":');
        throw privateError();
    });
    app.use('/api', apiNotFound);
    app.use(apiErrorHandler);
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    const manager = (await pool.query(`INSERT INTO users(fname,lname,tg_id,role,post)
        VALUES ('Errors','Manager','errors-manager',1,'Test') RETURNING id`)).rows[0];
    const worker = (await pool.query(`INSERT INTO users(fname,lname,tg_id,role,post)
        VALUES ('Errors','Worker','errors-worker',2,'Test') RETURNING id`)).rows[0];
    const task = (await pool.query(`INSERT INTO task_list(content,id_user,start_date,end_date,status)
        VALUES ('Errors task',$1,'2026-01-01','2099-01-01',false) RETURNING id`, [worker.id])).rows[0];
    const token = (id) => jwt.sign({ id, sessionVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const managerToken = token(manager.id);
    const workerToken = token(worker.id);

    async function request(method, path, body, bearer = managerToken, headers = {}) {
        const response = await fetch(base + path, {
            method, headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}), ...headers },
            ...(body === undefined ? {} : { body: typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body) })
        });
        const raw = await response.text();
        let data;
        try { data = JSON.parse(raw); } catch { data = raw; }
        return { status: response.status, headers: response.headers, data, raw };
    }
    async function snapshot() {
        const result = {};
        for (const table of ['users', 'teams_name', 'teams', 'task_list', 'report_list', 'vacation']) {
            result[table] = (await pool.query('SELECT * FROM ' + table + ' ORDER BY id')).rows;
        }
        return result;
    }
    function assertSafe(response, status, body) {
        assert.equal(response.status, status);
        assert.match(response.headers.get('content-type'), /application\/json/);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.deepEqual(response.data, body);
        assert.equal(response.raw.includes(marker), false);
        assert.equal(response.raw.includes('stack'), false);
        assert.equal(JSON.stringify(logs).includes(marker), false);
    }

    await t.test('malformed JSON is safe in development and production and never calls auth model', async (subtest) => {
        const before = await snapshot();
        subtest.mock.method(AuthModel, 'findUserByTGid', () => { throw new Error('Invalid JSON reached auth'); });
        for (const mode of ['development', 'production']) {
            app.set('env', mode);
            const response = await request('POST', '/api/auth/login?token=' + marker,
                '{"password":"' + marker + '"', marker, { Cookie: 'token=' + marker });
            assertSafe(response, 400, { message: 'Некорректный JSON' });
        }
        assert.deepEqual(logs, []);
        assert.deepEqual(await snapshot(), before);
    });

    await t.test('strict scalar JSON remains 400 and invalid requests do not write', async () => {
        const before = await snapshot();
        for (const body of ['null', 'true', '123', '"synthetic"']) {
            assertSafe(await request('POST', '/api/auth/login', body), 400, { message: 'Некорректный JSON' });
        }
        assert.deepEqual(await snapshot(), before);
    });

    await t.test('the existing 100 KiB JSON limit and decompressed limit remain unchanged', async () => {
        const prefix = '{"value":"';
        const suffix = '"}';
        const atLimit = prefix + 'x'.repeat(102400 - prefix.length - suffix.length) + suffix;
        assert.equal((await request('POST', '/api/error-fixture/echo', atLimit)).status, 204);
        const tooLarge = JSON.stringify({ value: marker + 'x'.repeat(102400) });
        assertSafe(await request('POST', '/api/error-fixture/echo', tooLarge), 413, { message: 'Превышен допустимый размер запроса' });
        assertSafe(await request('POST', '/api/error-fixture/echo', gzipSync(tooLarge), managerToken,
            { 'Content-Encoding': 'gzip' }), 413, { message: 'Превышен допустимый размер запроса' });
        assert.deepEqual(logs, []);
    });

    await t.test('unsupported charset and content encoding return safe 415', async () => {
        for (const headers of [
            { 'Content-Type': 'application/json; charset=' + marker },
            { 'Content-Encoding': marker }
        ]) {
            assertSafe(await request('POST', '/api/auth/login', JSON.stringify({ password: marker }), marker, headers),
                415, { message: 'Неподдерживаемая кодировка запроса' });
        }
        assert.deepEqual(logs, []);
    });

    await t.test('damaged gzip remains a safe 400 instead of becoming a server error', async () => {
        assertSafe(await request('POST', '/api/error-fixture/echo', marker, managerToken, { 'Content-Encoding': 'gzip' }),
            400, { message: 'Некорректный запрос' });
    });

    await t.test('unknown API route returns static JSON without reflecting path or query', async () => {
        for (const method of ['GET', 'POST']) {
            assertSafe(await request(method, '/api/missing-' + marker + '?token=' + marker, undefined),
                404, { message: 'Маршрут API не найден' });
        }
        assert.deepEqual(logs, []);
    });

    await t.test('unhandled promise, thrown string and untrusted status never expose error details', async () => {
        for (const mode of ['development', 'production']) {
            app.set('env', mode);
            for (const path of ['rejected', 'thrown', 'status']) {
                assertSafe(await request('GET', '/api/error-fixture/' + path), 500, { message: 'Ошибка сервера' });
            }
        }
        assert.equal(logs.length, 6);
        assert.ok(logs.every(args => args.length === 1 && args[0] === 'Ошибка обработки запроса API'));
    });

    await t.test('failure after headers closes the connection without logging the original exception', async () => {
        app.set('env', 'development');
        await assert.rejects(async () => {
            const response = await fetch(base + '/api/error-fixture/partial', { signal: AbortSignal.timeout(2000) });
            await response.text();
        }, error => error.name !== 'TimeoutError');
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(JSON.stringify(logs).includes(marker), false);
        assert.ok(logs.some(args => args[0] === 'Ошибка API после отправки заголовков'));
    });

    const employeeBody = { fname: 'Changed', lname: 'Worker', post: 'Test', errorOperation: marker };
    const cases = [
        ['list employees', UserModel, 'getAllUsers', 'GET', '/api/users', undefined, 'Ошибка загрузки сотрудников'],
        ['update employee', UserModel, 'updateUserInfo', 'POST', '/api/users/update/' + worker.id, employeeBody, 'Ошибка изменения сотрудника'],
        ['legacy delete employee', UserModel, 'deleteUser', 'GET', '/api/users/delete/' + worker.id, undefined, 'Ошибка удаления сотрудника'],
        ['delete employee', AuthModel, 'delUser', 'DELETE', '/api/auth/delUser/' + worker.id, undefined, 'Ошибка удаления сотрудника'],
        ['create vacation', UserModel, 'vacUsers', 'POST', '/api/users/vacation/' + worker.id,
            { startHoliday: '2026-11-15', endHoliday: '2026-11-16' }, 'Ошибка создания отпуска'],
        ['list vacations', UserModel, 'allVacUsers', 'GET', '/api/users/vacation/view', undefined, 'Ошибка загрузки отпусков'],
        ['employee team', UserModel, 'checkTeamUser', 'GET', '/api/users/' + worker.id + '/team', undefined, 'Ошибка загрузки команды сотрудника'],
        ['employee tasks', UserModel, 'checkCountTaskUser', 'GET', '/api/users/' + worker.id + '/tasks', undefined, 'Ошибка загрузки задач сотрудника'],
        ['employee vacation', UserModel, 'checkVacationUser', 'GET', '/api/users/' + worker.id + '/vacation', undefined, 'Ошибка загрузки отпуска сотрудника'],
        ['list tasks', TaskModel, 'getAllTasks', 'GET', '/api/tasks', undefined, 'Ошибка загрузки задач', true],
        ['create task', TaskModel, 'addNewTasks', 'POST', '/api/tasks/new',
            { content: 'Test', id_user: worker.id, start_date: '2026-11-15', end_date: '2026-11-16' }, 'Ошибка создания задачи', true],
        ['update task', TaskModel, 'updateTask', 'PUT', '/api/tasks/update/' + task.id,
            { content: 'Test', date: '2026-11-16', status: false }, 'Ошибка изменения задачи', true],
        ['delete task', TaskModel, 'deleteTask', 'DELETE', '/api/tasks/delete/' + task.id, undefined, 'Ошибка удаления задачи', true],
        ['list reports', ReportModel, 'getAllReports', 'GET', '/api/reports', undefined, 'Ошибка загрузки отчётов'],
        ['accept report', ReportModel, 'acceptReports', 'PUT', '/api/reports/accept/1', {}, 'Ошибка принятия отчёта'],
        ['send report', ReportModel, 'newReports', 'POST', '/api/reports/new',
            { id_task: task.id, text_report: 'Synthetic report', end_date: '2026-11-15' }, 'Ошибка отправки отчёта']
    ];
    for (const [label, model, modelMethod, method, path, body, operation, legacyError] of cases) {
        await t.test('safe model failure: ' + label, async (subtest) => {
            const before = await snapshot();
            subtest.mock.method(model, modelMethod, async () => { throw privateError(); });
            const response = await request(method, path, body);
            assertSafe(response, 500, legacyError ? { error: 'Ошибка сервера' } : { message: 'Ошибка сервера' });
            assert.deepEqual(logs, [[operation]]);
            assert.deepEqual(await snapshot(), before);
        });
    }

    await t.test('a real SQL input error does not leak its value or change rows', async () => {
        const before = await snapshot();
        const response = await request('POST', '/api/users/vacation/' + worker.id,
            { startHoliday: marker, endHoliday: '2026-11-16' });
        assertSafe(response, 500, { message: 'Ошибка сервера' });
        assert.deepEqual(logs, [['Ошибка создания отпуска']]);
        assert.deepEqual(await snapshot(), before);
    });

    await t.test('real FK refusal preserves history and the existing 500 response', async () => {
        const before = await snapshot();
        assertSafe(await request('DELETE', '/api/auth/delUser/' + worker.id), 500, { message: 'Ошибка сервера' });
        assert.deepEqual(logs, [['Ошибка удаления сотрудника']]);
        assert.deepEqual(await snapshot(), before);
    });

    await t.test('existing authentication, validation and missing-user statuses stay explicit', async () => {
        assertSafe(await request('GET', '/api/users', undefined, null), 401, { message: 'Требуется авторизация' });
        assertSafe(await request('GET', '/api/users', undefined, workerToken), 403, { message: 'Доступ запрещён' });
        const invalid = await request('POST', '/api/users/update/0', employeeBody);
        assertSafe(invalid, 400, { message: 'Некорректный идентификатор' });
        assertSafe(await request('POST', '/api/users/update/2147483647', employeeBody), 404, { message: 'Пользователь не найден' });
        assert.equal((await request('GET', '/api/users')).status, 200);
        assert.deepEqual(logs, []);
    });
});
