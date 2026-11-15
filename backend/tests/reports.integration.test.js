const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

test('report validation and completion on synthetic PostgreSQL', { skip: process.env.RECOVERY_TEST_DATABASE !== '1' }, async (t) => {
    assert.equal(process.env.NODE_ENV, 'test');
    assert.equal(process.env.DB_HOST, 'recovery-db');
    assert.equal(process.env.DB_NAME, 'dailysync_recovery_test');
    assert.equal(process.env.DB_USER, 'recovery_test');
    const pool = require('../db');
    t.after(() => pool.end());
    assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name, 'dailysync_recovery_test');
    const express = require('express');
    const jwt = require('jsonwebtoken');
    const reportModel = require('../models/reportModel');
    const app = express();
    app.use(express.json());
    app.use('/api/reports', require('../routes/reportRoutes'));
    app.use('/api', require('../middleware/errorMiddleware').apiNotFound);
    app.use(require('../middleware/errorMiddleware').apiErrorHandler);
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const worker = (await pool.query(`INSERT INTO users(fname,lname,tg_id,post,role)
        VALUES ('Reports','Worker','reports-validation-worker','Test',2) RETURNING id`)).rows[0];
    const other = (await pool.query(`INSERT INTO users(fname,lname,tg_id,post,role)
        VALUES ('Reports','Other','reports-validation-other','Test',2) RETURNING id`)).rows[0];
    const token = (id) => jwt.sign({ id, sessionVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const workerToken = token(worker.id);
    async function createTask(owner = worker.id, content = 'reports-validation-task') {
        return (await pool.query(`INSERT INTO task_list(content,id_user,start_date,end_date,status)
            VALUES ($1,$2,'2026-01-01','2099-01-01',false) RETURNING id`, [content, owner])).rows[0].id;
    }
    const taskId = await createTask();
    const valid = () => ({ id_task: taskId, text_report: 'Synthetic report', end_date: '2026-11-15' });
    async function post(body, bearer = workerToken) {
        const response = await fetch(base + '/api/reports/new', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        const raw = await response.text();
        let data;
        try { data = JSON.parse(raw); } catch { data = raw; }
        return { status: response.status, data };
    }
    async function snapshot() {
        return {
            tasks: (await pool.query('SELECT * FROM task_list ORDER BY id')).rows,
            reports: (await pool.query('SELECT * FROM report_list ORDER BY id')).rows
        };
    }

    await t.test('anonymous requests never write', async () => {
        const before = await snapshot();
        assert.equal((await post(valid(), null)).status, 401);
        assert.deepEqual(await snapshot(), before);
    });
    await t.test('invalid bodies, text and IDs are rejected before the report model', async (subtest) => {
        const before = await snapshot();
        subtest.mock.method(reportModel, 'newReports', () => { throw new Error('Validation must precede SQL'); });
        for (const text_report of [undefined, null, '', ' \t ', 42, false, [], {}, 'x'.repeat(256), '😀'.repeat(256), 'x\0y', '\ud800', '\udfff']) {
            assert.equal((await post({ ...valid(), text_report })).status, 400);
        }
        for (const id_task of [undefined, null, 0, -1, 1.5, true, [], {}, '01', '1e2', 2147483648]) {
            assert.equal((await post({ ...valid(), id_task })).status, 400);
        }
        for (const body of [undefined, {}, []]) assert.equal((await post(body)).status, 400);
        assert.deepEqual(await snapshot(), before);
    });
    await t.test('impossible dates and malformed timestamps fail before SQL without writes', async (subtest) => {
        const before = await snapshot();
        subtest.mock.method(reportModel, 'newReports', () => { throw new Error('Invalid date reached SQL'); });
        for (const end_date of [undefined, null, 0, [], {}, '', '2026-02-30', '2026-02-29', '1900-02-29',
            '2026-04-31', '0000-01-01', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32',
            '11/15/2026', '2026-1-1', ' 2026-11-15', '2026-11-15 ', '2026-02-30T12:00:00Z',
            '2026-11-15T24:00:00Z', '2026-11-15T23:60:00Z', '2026-11-15T23:59:60Z',
            '2026-11-15T12:00:00', '2026-11-15T12:00:00+24:00', '2026-11-15T12:00:00+03:60',
            '2026-11-15T12:00:00+16:00', '2026-11-15T12:00:00-23:59',
            '2026-11-15T12:00:00.' + '1'.repeat(21) + 'Z']) {
            const response = await post({ ...valid(), end_date });
            assert.equal(response.status, 400, String(end_date));
            assert.deepEqual(response.data, { message: 'Некорректные данные отчёта' });
        }
        assert.deepEqual(await snapshot(), before);
    });
    await t.test('calendar boundaries and ISO timestamps retain their calendar date in PostgreSQL', async () => {
        for (const end_date of ['0001-01-01', '0099-01-01', '1900-02-28', '2000-02-29', '2028-02-29', '9999-12-31',
            '2026-11-15T23:59:59.999Z', '2026-11-15T00:00:00+03:00', '2026-11-15T23:59:59-05:00',
            '2026-11-15T12:00:00+15:59', '2026-11-15T12:00:00.1234567891234567Z']) {
            const id = await createTask();
            assert.equal((await post({ ...valid(), id_task: id, end_date })).status, 200, end_date);
            const stored = (await pool.query("SELECT to_char(end_date, 'YYYY-MM-DD') AS date FROM report_list WHERE id_task=$1", [id])).rows[0];
            assert.equal(stored.date, end_date.slice(0, 10));
            assert.equal((await pool.query('SELECT status FROM task_list WHERE id=$1', [id])).rows[0].status, true);
        }
    });
    await t.test('255 Unicode characters and whitespace persist unchanged; author comes from JWT', async () => {
        for (const text_report of ['😀'.repeat(255), '𠮷'.repeat(255), 'e\u0301'.repeat(127) + 'x', '  Synthetic report  ']) {
            const id = await createTask();
            assert.equal((await post({ ...valid(), id_task: id, text_report, id_user: other.id })).status, 200);
            const stored = (await pool.query('SELECT text_report,id_user FROM report_list WHERE id_task=$1', [id])).rows[0];
            assert.equal(stored.text_report, text_report);
            assert.equal(Number(stored.id_user), worker.id);
        }
    });
    await t.test('foreign or missing task returns 404 without changing data', async () => {
        const foreign = await createTask(other.id);
        const before = await snapshot();
        for (const id_task of [foreign, 2147483647]) assert.equal((await post({ ...valid(), id_task })).status, 404);
        assert.deepEqual(await snapshot(), before);
    });
    await t.test('a real completion failure rolls back report INSERT and logs no private details', async (subtest) => {
        const id = await createTask(worker.id, 'reports-validation-fail-update');
        const before = await snapshot();
        const logs = [];
        subtest.mock.method(console, 'error', (...args) => logs.push(args));
        await pool.query(`CREATE FUNCTION reports_validation_fail_update() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN IF NEW.content = 'reports-validation-fail-update' THEN RAISE EXCEPTION 'private-report-sql-error'; END IF; RETURN NEW; END $$`);
        await pool.query('CREATE TRIGGER reports_validation_failure BEFORE UPDATE ON task_list FOR EACH ROW EXECUTE FUNCTION reports_validation_fail_update()');
        try {
            const response = await post({ ...valid(), id_task: id });
            assert.equal(response.status, 500);
            assert.deepEqual(response.data, { message: 'Ошибка сервера' });
            assert.equal(JSON.stringify(logs).includes('private-report-sql-error'), false);
            assert.deepEqual(await snapshot(), before);
        } finally {
            await pool.query('DROP TRIGGER reports_validation_failure ON task_list');
            await pool.query('DROP FUNCTION reports_validation_fail_update()');
        }
    });
    await t.test('existing parallel multiple-report behavior remains supported', async () => {
        const id = await createTask();
        const responses = await Promise.all([post({ ...valid(), id_task: id }), post({ ...valid(), id_task: id })]);
        assert.deepEqual(responses.map(response => response.status), [200, 200]);
        assert.equal((await pool.query('SELECT count(*)::integer AS count FROM report_list WHERE id_task=$1', [id])).rows[0].count, 2);
        assert.equal((await pool.query('SELECT status FROM task_list WHERE id=$1', [id])).rows[0].status, true);
    });
});
