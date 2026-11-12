const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

test('recovery and safe user DTO over HTTP with synthetic PostgreSQL', {
    skip: process.env.RECOVERY_TEST_DATABASE !== '1'
}, async (t) => {
    // Check before loading pg/dotenv: these tests must never use the current DB.
    assert.equal(process.env.NODE_ENV, 'test');
    assert.equal(process.env.DB_HOST, 'recovery-db');
    assert.equal(process.env.DB_NAME, 'dailysync_recovery_test');
    assert.equal(process.env.DB_USER, 'recovery_test');
    const pool = require('../db');
    t.after(() => pool.end());
    const database = await pool.query('SELECT current_database() AS name');
    assert.equal(database.rows[0].name, 'dailysync_recovery_test');

    const express = require('express');
    const AuthModel = require('../models/authModel');
    const UserModel = require('../models/userModel');
    const { verifyPassword, classifyPassword } = require('../utils/passwords');
    const { recovery, createPasswordRecovery } = require('../utils/passwordRecovery');
    let time = 1000;
    t.beforeEach(() => {
        time = 1000;
        Object.assign(recovery, createPasswordRecovery({ now: () => time }));
    });
    const app = express();
    app.use(express.json());
    app.use('/api/auth', require('../routes/authRoutes'));
    app.use('/api/users', require('../routes/userRoutes'));
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
    await once(server, 'listening');
    const baseURL = `http://127.0.0.1:${server.address().port}`;
    const manager = await pool.query(`INSERT INTO users (fname,lname,tg_id,role,post)
        VALUES ('Test','Manager','recovery-test-manager',1,'Test') RETURNING id`);
    const managerToken = require('jsonwebtoken').sign({ id: manager.rows[0].id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    async function post(path, body, headers = {}) {
        const response = await fetch(baseURL + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json',
                ...(path.startsWith('/api/users/') ? { Authorization: `Bearer ${managerToken}` } : {}), ...headers },
            body: JSON.stringify(body)
        });
        const text = await response.text();
        let data;
        try { data = JSON.parse(text); } catch { data = text; }
        return { status: response.status, body: data, headers: response.headers };
    }
    let userCount = 0;
    async function createUser(overrides = {}) {
        const user = {
            tg_id: `synthetic-${++userCount}`,
            question: 'Synthetic question?', answer: 'synthetic-answer', ...overrides
        };
        const result = await pool.query(`INSERT INTO users
            (fname, lname, tg_id, role, post, password, question, answer, chat_id, pending_report)
            VALUES ('Test', 'Worker', $1, 2, 'Test post', 'synthetic-old-password', $2, $3, 123456, true)
            RETURNING id`, [user.tg_id, user.question, user.answer]);
        return { ...user, id: result.rows[0].id };
    }
    async function passwordOf(user) {
        return (await pool.query('SELECT password FROM users WHERE id = $1', [user.id])).rows[0].password;
    }
    async function assertPassword(user, password) {
        const stored = await passwordOf(user);
        assert.equal(classifyPassword(stored), 'scrypt');
        assert.notEqual(stored, password);
        assert.equal((await verifyPassword(password, stored)).matches, true);
    }
    async function grant(user) {
        const response = await post('/api/auth/recAns', { tg_id: user.tg_id, secAns: user.answer });
        assert.equal(response.status, 200);
        return response.body.recoveryToken;
    }
    const reset = (user, token, password = 'synthetic-new-password') => post('/api/auth/recPass/newPass', {
        tg_id: user.tg_id, recoveryToken: token, textNewPassword: password
    });

    await t.test('direct reset is denied without a grant and does not modify the password', async () => {
        const user = await createUser();
        for (const token of [undefined, null, {}, 'forged', 'f'.repeat(64)]) {
            assert.equal((await reset(user, token)).status, 403);
        }
        assert.equal(await passwordOf(user), 'synthetic-old-password');
    });

    await t.test('complete recovery preserves login compatibility and does not expose secrets', async () => {
        const user = await createUser();
        const question = await post('/api/auth/recPass', { tg_id: user.tg_id });
        assert.equal(question.status, 200);
        assert.deepEqual(question.body.recoverPassword, { questions: user.question });
        assert.equal(question.headers.get('cache-control'), 'no-store');
        const answer = await post('/api/auth/recAns', { tg_id: user.tg_id, secAns: user.answer });
        assert.equal(answer.status, 200);
        assert.match(answer.body.recoveryToken, /^[a-f0-9]{64}$/);
        assert.equal(answer.body.expiresIn, 300);
        assert.equal(answer.headers.get('cache-control'), 'no-store');
        assert.equal(JSON.stringify(answer.body).includes(user.answer), false);
        assert.equal('recoverPassword' in answer.body, false);
        const changed = await reset(user, answer.body.recoveryToken);
        assert.equal(changed.status, 200);
        assert.equal(changed.body.success, true);
        assert.deepEqual(Object.keys(changed.body).sort(), ['message', 'success']);
        await assertPassword(user, 'synthetic-new-password');
        assert.equal((await post('/api/auth/login', { tg_id: user.tg_id, password: 'synthetic-old-password' })).status, 400);
        assert.equal((await post('/api/auth/login', { tg_id: user.tg_id, password: 'synthetic-new-password' })).status, 200);
        assert.equal((await reset(user, answer.body.recoveryToken, 'replayed')).status, 403);
        await assertPassword(user, 'synthetic-new-password');
    });

    await t.test('invalid body types, empty answers and unknown users cannot obtain a grant', async () => {
        const user = await createUser();
        for (const body of [null, {}, { tg_id: null }, { tg_id: [] }, { tg_id: 123 }, { tg_id: ' ' }, { tg_id: 'a'.repeat(256) }]) {
            assert.equal((await post('/api/auth/recAns', body)).status, 400);
        }
        for (const secAns of [undefined, null, '', '   ', {}, [], 'a'.repeat(256)]) {
            assert.equal((await post('/api/auth/recAns', { tg_id: user.tg_id, secAns })).status, 400);
        }
        assert.equal((await post('/api/auth/recAns', { tg_id: user.tg_id, secAns: 'wrong' })).status, 403);
        assert.equal((await post('/api/auth/recAns', { tg_id: 'nonexistent', secAns: 'wrong' })).status, 403);
    });

    await t.test('null or blank stored credentials and ambiguous tg_id fail closed', async () => {
        for (const overrides of [{ answer: null }, { answer: ' ' }, { question: null }, { question: '' }]) {
            const user = await createUser(overrides);
            assert.equal((await post('/api/auth/recPass', { tg_id: user.tg_id })).status, 403);
            const answer = await post('/api/auth/recAns', { tg_id: user.tg_id, secAns: 'synthetic-answer' });
            assert.equal(answer.status, 403);
            assert.equal('recoveryToken' in answer.body, false);
        }
        const first = await createUser();
        await createUser({ tg_id: first.tg_id });
        assert.equal((await post('/api/auth/recPass', { tg_id: first.tg_id })).status, 403);
        assert.equal((await post('/api/auth/recAns', { tg_id: first.tg_id, secAns: first.answer })).status, 403);
    });

    await t.test('grant cannot be substituted for another user; body IDs are not trusted', async () => {
        const owner = await createUser();
        const other = await createUser();
        const token = await grant(owner);
        assert.equal((await reset(other, token)).status, 403);
        assert.equal(await passwordOf(other), 'synthetic-old-password');
        const result = await post('/api/auth/recPass/newPass', {
            tg_id: owner.tg_id, id: other.id, id_user: other.id,
            textNewPassword: 'synthetic-owner-password', recoveryToken: token
        });
        assert.equal(result.status, 200);
        await assertPassword(owner, 'synthetic-owner-password');
        assert.equal(await passwordOf(other), 'synthetic-old-password');
    });

    await t.test('expired and superseded grants are denied over HTTP', async () => {
        const user = await createUser();
        const expired = await grant(user);
        time += 300000;
        assert.equal((await reset(user, expired)).status, 403);
        const old = await grant(user);
        const fresh = await grant(user);
        assert.equal((await reset(user, old)).status, 403);
        assert.equal((await reset(user, fresh)).status, 200);
    });

    await t.test('parallel HTTP resets perform only one password change', async () => {
        const user = await createUser();
        const token = await grant(user);
        const results = await Promise.all([reset(user, token, 'first-password'), reset(user, token, 'second-password')]);
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 403]);
        await assertPassword(user, results[0].status === 200 ? 'first-password' : 'second-password');
    });

    await t.test('invalid passwords do not consume a valid grant', async () => {
        const user = await createUser();
        const token = await grant(user);
        for (const password of [null, '', '   ', {}, false]) {
            assert.equal((await reset(user, token, password)).status, 400);
        }
        assert.equal(await passwordOf(user), 'synthetic-old-password');
        assert.equal((await reset(user, token)).status, 200);
    });

    await t.test('grant remains consumed after SQL failure, without exposing internal errors', async (subtest) => {
        const user = await createUser();
        const token = await grant(user);
        subtest.mock.method(AuthModel, 'newPassword', async () => { throw new Error('synthetic-private-SQL-details'); });
        const failure = await reset(user, token);
        assert.equal(failure.status, 500);
        assert.equal(JSON.stringify(failure.body).includes('synthetic-private'), false);
        assert.equal((await reset(user, token)).status, 403);
        assert.equal(await passwordOf(user), 'synthetic-old-password');
    });

    await t.test('grant changes only its original user even if tg_id becomes duplicated', async () => {
        const user = await createUser();
        const token = await grant(user);
        const duplicate = await createUser({ tg_id: user.tg_id });
        assert.equal((await reset(user, token)).status, 200);
        await assertPassword(user, 'synthetic-new-password');
        assert.equal(await passwordOf(duplicate), 'synthetic-old-password');
    });

    await t.test('renamed account cannot be reset through stale tg_id', async () => {
        const user = await createUser();
        const token = await grant(user);
        await pool.query('UPDATE users SET tg_id = $1 WHERE id = $2', ['renamed-test-user', user.id]);
        assert.equal((await reset(user, token)).status, 403);
        assert.equal(await passwordOf(user), 'synthetic-old-password');
    });

    await t.test('user update exposes only allowed fields; nonexistent ID returns 404', async () => {
        const user = await createUser();
        const result = await post(`/api/users/update/${user.id}`, { fname: 'Changed', lname: 'Worker', post: 'New post' });
        assert.equal(result.status, 201);
        assert.deepEqual(Object.keys(result.body.user).sort(), ['fname', 'id', 'lname', 'post', 'role', 'tg_id']);
        assert.equal(result.body.user.fname, 'Changed');
        assert.equal(await passwordOf(user), 'synthetic-old-password');
        assert.equal((await post('/api/users/update/2147483647', { fname: 'X', lname: 'Y', post: 'Z' })).status, 404);
        const modelResult = await UserModel.updateUserInfo(user.id, 'Test', 'Worker', 'Test post');
        assert.deepEqual(Object.keys(modelResult).sort(), ['fname', 'id', 'lname', 'post', 'role', 'tg_id']);
    });

    await t.test('DTO blocks unexpected model secrets as a second layer', async (subtest) => {
        const safe = { id: 123, fname: 'Test', lname: 'Worker', tg_id: 'dto-test', post: 'Test', role: 2 };
        subtest.mock.method(UserModel, 'updateUserInfo', async () => ({
            ...safe, password: 'synthetic-secret', answer: 'secret-answer', question: '?', token: 'secret-token', chat_id: 123, pending_report: true
        }));
        const response = await post('/api/users/update/123', { fname: 'Test', lname: 'Worker', post: 'Test' });
        assert.equal(response.status, 201);
        assert.deepEqual(response.body.user, safe);
    });

    await t.test('question and answer errors do not expose SQL details', async (subtest) => {
        for (const [method, path, body] of [
            ['recPass', '/api/auth/recPass', { tg_id: 'error-test' }],
            ['recAns', '/api/auth/recAns', { tg_id: 'error-test', secAns: 'answer' }]
        ]) {
            subtest.mock.method(AuthModel, method, async () => { throw new Error('synthetic-private-SQL-details'); });
            const response = await post(path, body);
            assert.equal(response.status, 500);
            assert.deepEqual(response.body, { message: 'Ошибка сервера' });
        }
    });

    await t.test('account limit covers all recovery stages and resets after 15 minutes', async () => {
        const user = await createUser();
        for (let i = 0; i < 15; i++) {
            assert.equal((await post('/api/auth/recAns', { tg_id: user.tg_id, secAns: 'wrong' })).status, 403);
        }
        for (const path of ['/api/auth/recPass', '/api/auth/recAns', '/api/auth/recPass/newPass']) {
            const limited = await post(path, { tg_id: user.tg_id });
            assert.equal(limited.status, 429);
            assert.equal(limited.headers.get('retry-after'), '900');
        }
        time += 900000;
        assert.equal((await post('/api/auth/recPass', { tg_id: user.tg_id })).status, 200);
    });

    await t.test('IP limit cannot be bypassed with different accounts or spoofed forwarding headers', async () => {
        for (let i = 0; i < 60; i++) {
            assert.equal((await post('/api/auth/recPass', { tg_id: `ip-test-${i}` }, { 'X-Forwarded-For': `192.0.2.${i}` })).status, 403);
        }
        assert.equal((await post('/api/auth/recPass', { tg_id: 'another-account' })).status, 429);
    });
});
