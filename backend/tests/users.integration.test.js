const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

test('employee creation and update on synthetic PostgreSQL', { skip: process.env.RECOVERY_TEST_DATABASE !== '1' }, async (t) => {
    assert.equal(process.env.NODE_ENV, 'test');
    assert.equal(process.env.DB_HOST, 'recovery-db');
    assert.equal(process.env.DB_NAME, 'dailysync_recovery_test');
    const pool = require('../db');
    t.after(() => pool.end());
    const express = require('express');
    const jwt = require('jsonwebtoken');
    const { verifyPassword } = require('../utils/passwords');
    const AuthModel = require('../models/authModel');
    const UserModel = require('../models/userModel');
    const app = express();
    app.use(express.json());
    app.use('/api/auth', require('../routes/authRoutes'));
    app.use('/api/users', require('../routes/userRoutes'));
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const manager = (await pool.query(`INSERT INTO users(fname,lname,tg_id,post,role)
        VALUES ('Users','Manager','users-validation-manager','Test',1) RETURNING id`)).rows[0];
    const worker = (await pool.query(`INSERT INTO users(fname,lname,tg_id,post,role,password)
        VALUES ('Users','Worker','users-validation-worker','Test',2,'synthetic-unmodified') RETURNING id`)).rows[0];
    const token = (id) => jwt.sign({ id, sessionVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const managerToken = token(manager.id);
    const workerToken = token(worker.id);
    let sequence = 0;
    const valid = () => ({ fname: 'New', lname: 'Employee', tg_id: `users-validation-created-${++sequence}`,
        post: 'Test', role: 2, pass: 'synthetic-password' });
    async function post(path, body, bearer = managerToken) {
        const response = await fetch(base + path, { method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        const raw = await response.text();
        let data;
        try { data = JSON.parse(raw); } catch { data = raw; }
        return { status: response.status, data, headers: response.headers };
    }
    const create = (body) => post('/api/auth/createUser', body);
    const update = (body, id = worker.id) => post(`/api/users/update/${id}`, body);
    const snapshot = async () => (await pool.query('SELECT * FROM users ORDER BY id')).rows;
    const safeKeys = ['fname', 'id', 'lname', 'post', 'role', 'tg_id'];

    await t.test('only a manager can create or update; rejection never writes', async () => {
        const before = await snapshot();
        for (const bearer of [null, workerToken]) {
            for (const path of ['/api/auth/createUser', `/api/users/update/${worker.id}`]) {
                assert.equal((await post(path, valid(), bearer)).status, bearer ? 403 : 401);
            }
        }
        assert.deepEqual(await snapshot(), before);
    });
    await t.test('invalid required creation fields are rejected before DB/KDF without changing rows', async (subtest) => {
        const before = await snapshot();
        subtest.mock.method(AuthModel, 'findUserByTGid', () => { throw new Error('Validation must run before DB'); });
        for (const field of ['fname', 'lname', 'post']) {
            for (const value of [undefined, null, '', ' \t ', 42, false, [], {}, 'x'.repeat(256), '😀'.repeat(256), 'nul\0value', '\ud800']) {
                assert.equal((await create({ ...valid(), [field]: value })).status, 400, field);
            }
        }
        for (const body of [undefined, {}, [], null]) assert.equal((await create(body)).status, 400);
        assert.deepEqual(await snapshot(), before);
    });
    await t.test('invalid account IDs and roles are rejected without writes', async () => {
        const before = await snapshot();
        for (const tg_id of [undefined, null, '', ' ', 123, [], {}, 'x'.repeat(256), '😀'.repeat(128), 'x\0y', '\udfff']) {
            assert.equal((await create({ ...valid(), tg_id })).status, 400);
        }
        for (const role of [undefined, null, 0, 3, -1, 1.5, '2', true, [], {}]) {
            assert.equal((await create({ ...valid(), role })).status, 400);
        }
        assert.deepEqual(await snapshot(), before);
    });
    await t.test('255 Unicode characters persist intact; response is a safe DTO and password is scrypt', async () => {
        const body = { ...valid(), fname: '😀'.repeat(255), lname: '𠮷'.repeat(255), post: 'e\u0301'.repeat(127) + 'x', pass: '  длинный🔐 '.repeat(150) };
        const response = await create(body);
        assert.equal(response.status, 201);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.deepEqual(Object.keys(response.data.user).sort(), safeKeys);
        const stored = (await pool.query('SELECT * FROM users WHERE id=$1', [response.data.user.id])).rows[0];
        for (const field of ['fname', 'lname', 'tg_id', 'post', 'role']) assert.equal(stored[field], body[field]);
        assert.equal(stored.session_version, 0);
        assert.equal((await verifyPassword(body.pass, stored.password)).matches, true);
        assert.equal(JSON.stringify(response.data).includes(stored.password), false);
        assert.equal(JSON.stringify(response.data).includes(body.pass), false);
    });
    await t.test('account boundary remains compatible with login and manager role is preserved', async () => {
        for (const account of ['a'.repeat(255), '😀'.repeat(127) + 'x']) {
            const body = { ...valid(), tg_id: account, role: 1 };
            const response = await create(body);
            assert.equal(response.status, 201);
            assert.equal(response.data.user.role, 1);
            const signed = await post('/api/auth/login', { tg_id: account, password: body.pass }, null);
            assert.equal(signed.status, 200);
            assert.equal(signed.data.user.id, response.data.user.id);
        }
    });
    await t.test('existing account returns 409 and preserves original credentials and fields', async () => {
        const before = await snapshot();
        const result = await create({ ...valid(), tg_id: 'users-validation-worker', pass: 'attempted-replacement' });
        assert.equal(result.status, 409);
        assert.deepEqual(await snapshot(), before);
    });
    await t.test('create controller filters unexpected model secrets as a second layer', async (subtest) => {
        const safe = { id: 987654, fname: 'DTO', lname: 'Test', tg_id: 'users-validation-dto', post: 'Test', role: 2 };
        subtest.mock.method(AuthModel, 'createUser', async () => ({ ...safe, password: 'private-hash', answer: 'private-answer', session_version: 123, chat_id: 456 }));
        const response = await create(valid());
        assert.equal(response.status, 201);
        assert.deepEqual(response.data.user, safe);
    });
    await t.test('invalid update IDs and fields never modify a user; absent valid ID returns 404', async (subtest) => {
        const before = await snapshot();
        const body = { fname: 'Changed', lname: 'Employee', post: 'Test' };
        for (const id of ['0', '-1', '01', 'abc', '1e2', '2147483648']) assert.equal((await update(body, id)).status, 400);
        assert.equal((await update(body, 2147483647)).status, 404);
        subtest.mock.method(UserModel, 'updateUserInfo', () => { throw new Error('Invalid input must not reach SQL'); });
        for (const field of ['fname', 'lname', 'post']) {
            for (const value of [undefined, null, '', ' ', 12, [], {}, 'x'.repeat(256), '😀'.repeat(256), 'x\0y', '\ud800']) {
                assert.equal((await update({ ...body, [field]: value })).status, 400);
            }
        }
        for (const payload of [undefined, {}, [], null]) assert.equal((await update(payload)).status, 400);
        assert.deepEqual(await snapshot(), before);
    });
    await t.test('valid update accepts Unicode limit, preserves spaces and ignores extra credential fields', async () => {
        const before = (await pool.query('SELECT * FROM users WHERE id=$1', [worker.id])).rows[0];
        const body = { fname: '😀'.repeat(255), lname: '  Employee  ', post: '  Test  ',
            password: 'new-password', pass: 'new-password', role: 1, tg_id: 'new-account', session_version: 9 };
        const response = await update(body);
        assert.equal(response.status, 201);
        assert.deepEqual(Object.keys(response.data.user).sort(), safeKeys);
        const after = (await pool.query('SELECT * FROM users WHERE id=$1', [worker.id])).rows[0];
        assert.deepEqual(after, { ...before, fname: body.fname, lname: body.lname, post: body.post });
    });
    await t.test('update database errors return safe JSON and do not log SQL/private values', async (subtest) => {
        const logs = [];
        subtest.mock.method(console, 'error', (...args) => logs.push(args));
        subtest.mock.method(UserModel, 'updateUserInfo', async () => { throw new Error('private-sql-secret-value'); });
        const before = await snapshot();
        const response = await update({ fname: 'Changed', lname: 'Employee', post: 'Test' });
        assert.equal(response.status, 500);
        assert.deepEqual(response.data, { message: 'Ошибка сервера' });
        assert.equal(JSON.stringify(logs).includes('private-sql-secret-value'), false);
        assert.deepEqual(await snapshot(), before);
    });
    await t.test('real INSERT failure leaves no employee and exposes no database details', async (subtest) => {
        const logs = [];
        subtest.mock.method(console, 'error', (...args) => logs.push(args));
        await pool.query(`CREATE FUNCTION users_validation_fail_insert() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN IF NEW.tg_id = 'users-validation-sql-failure' THEN RAISE EXCEPTION 'private-create-sql-secret'; END IF; RETURN NEW; END $$`);
        await pool.query('CREATE TRIGGER users_validation_failure BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION users_validation_fail_insert()');
        try {
            const before = await snapshot();
            const response = await create({ ...valid(), tg_id: 'users-validation-sql-failure' });
            assert.equal(response.status, 500);
            assert.deepEqual(response.data, { message: 'Ошибка сервера' });
            assert.equal(JSON.stringify(logs).includes('private-create-sql-secret'), false);
            assert.deepEqual(await snapshot(), before);
        } finally {
            await pool.query('DROP TRIGGER users_validation_failure ON users');
            await pool.query('DROP FUNCTION users_validation_fail_insert()');
        }
    });
});
