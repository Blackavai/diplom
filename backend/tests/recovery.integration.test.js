const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

test('retired recovery routes preserve data and user DTOs stay safe', {
    skip: process.env.RECOVERY_TEST_DATABASE !== '1'
}, async (t) => {
    assert.equal(process.env.NODE_ENV, 'test');
    assert.equal(process.env.DB_HOST, 'recovery-db');
    assert.equal(process.env.DB_NAME, 'dailysync_recovery_test');
    const pool = require('../db');
    t.after(() => pool.end());
    const AuthModel = require('../models/authModel');
    const UserModel = require('../models/userModel');
    const express = require('express');
    const app = express();
    app.use(express.json());
    app.use('/api/auth', require('../routes/authRoutes'));
    app.use('/api/users', require('../routes/userRoutes'));
    app.use('/api', require('../middleware/errorMiddleware').apiNotFound);
    app.use(require('../middleware/errorMiddleware').apiErrorHandler);
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    await once(server, 'listening');
    const manager = (await pool.query(`INSERT INTO users(fname,lname,tg_id,role,post)
        VALUES ('Test','Manager','recovery-test-manager',1,'Test') RETURNING id`)).rows[0];
    const managerToken = require('jsonwebtoken').sign({ id: manager.id, sessionVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });
    async function post(path, body, headers = {}) {
        const response = await fetch(`http://127.0.0.1:${server.address().port}` + path, {
            method: 'POST', headers: { 'Content-Type': 'application/json',
                ...(path.startsWith('/api/users/') ? { Authorization: `Bearer ${managerToken}` } : {}), ...headers },
            body: JSON.stringify(body)
        });
        return { status: response.status, body: await response.json(), headers: response.headers };
    }
    let sequence = 0;
    async function createUser() {
        return (await pool.query(`INSERT INTO users(fname,lname,tg_id,role,post,password,question,answer)
            VALUES ('Test','Worker',$1,2,'Test','synthetic-old-password','Synthetic question','synthetic-answer') RETURNING id,tg_id`,
        [`retired-recovery-${++sequence}`])).rows[0];
    }
    const passwordOf = async (user) => (await pool.query('SELECT password FROM users WHERE id=$1', [user.id])).rows[0].password;

    await t.test('all three old routes return 410 without grants, questions or password changes', async () => {
        const user = await createUser();
        const before = (await pool.query('SELECT * FROM users WHERE id=$1', [user.id])).rows[0];
        const oldGrant = require('../utils/passwordRecovery').recovery.issue(user.id, user.tg_id);
        for (const path of ['/recPass', '/recAns', '/recPass/newPass']) {
            for (const body of [{}, null, { tg_id: user.tg_id, secAns: 'synthetic-answer', recoveryToken: oldGrant, textNewPassword: 'Must not apply' }]) {
                const result = await post('/api/auth' + path, body);
                // Строгий JSON-парсер отклоняет null до входа в маршрут.
                assert.equal(result.status, body === null ? 400 : 410);
                if (body === null) continue;
                assert.equal(result.headers.get('cache-control'), 'no-store');
                assert.deepEqual(Object.keys(result.body), ['message']);
                assert.match(result.body.message, /Обратитесь к менеджеру/);
                assert.equal(JSON.stringify(result.body).includes('synthetic-answer'), false);
                assert.equal(JSON.stringify(result.body).includes(oldGrant), false);
            }
        }
        assert.deepEqual((await pool.query('SELECT * FROM users WHERE id=$1', [user.id])).rows[0], before);
    });
    await t.test('retired routes never read credentials or call password mutation models', async (subtest) => {
        subtest.mock.method(AuthModel, 'findUserByTGid', () => { throw new Error('Must not query credentials'); });
        subtest.mock.method(AuthModel, 'changeOwnPassword', () => { throw new Error('Must not change password'); });
        for (const path of ['/recPass', '/recAns', '/recPass/newPass']) {
            assert.equal((await post('/api/auth' + path, { tg_id: 'Unknown' })).status, 410);
        }
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

});
