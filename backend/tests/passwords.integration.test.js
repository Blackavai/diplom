const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

test('password hashing, transition and login limits over HTTP', { skip: process.env.RECOVERY_TEST_DATABASE !== '1' }, async (t) => {
    assert.equal(process.env.NODE_ENV, 'test');
    assert.equal(process.env.DB_HOST, 'recovery-db');
    assert.equal(process.env.DB_NAME, 'dailysync_recovery_test');
    const pool = require('../db');
    t.after(() => pool.end());
    const express = require('express');
    const jwt = require('jsonwebtoken');
    const AuthModel = require('../models/authModel');
    const { hashPassword, verifyPassword, classifyPassword } = require('../utils/passwords');
    const { loginAttempts, createLoginAttempts } = require('../utils/loginAttempts');
    let time = 1000;
    t.beforeEach(() => {
        time = 1000;
        Object.assign(loginAttempts, createLoginAttempts({ now: () => time }));
        delete process.env.LEGACY_PASSWORD_LOGIN_UNTIL;
    });
    const originalDeadline = process.env.LEGACY_PASSWORD_LOGIN_UNTIL;
    t.after(() => {
        if (originalDeadline === undefined) delete process.env.LEGACY_PASSWORD_LOGIN_UNTIL;
        else process.env.LEGACY_PASSWORD_LOGIN_UNTIL = originalDeadline;
    });
    const app = express();
    app.use(express.json());
    app.use('/api/auth', require('../routes/authRoutes'));
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    let sequence = 0;
    async function user(password, role = 2) {
        const tg_id = `password-user-${++sequence}`;
        const result = await pool.query(`INSERT INTO users(fname,lname,tg_id,role,post,password,question,answer)
            VALUES ('Password','Test',$1,$2,'Test',$3,'Synthetic question','synthetic-answer') RETURNING id`, [tg_id, role, password]);
        const id = result.rows[0].id;
        return { id, tg_id, token: jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1h' }) };
    }
    const manager = await user(null, 1);
    async function post(path, body, actor, headers = {}) {
        const response = await fetch(base + '/api/auth' + path, { method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}), ...headers },
            body: JSON.stringify(body) });
        const text = await response.text();
        let data;
        try { data = JSON.parse(text); } catch { data = text; }
        return { status: response.status, data, headers: response.headers };
    }
    const login = (actor, password, headers) => post('/login', { tg_id: actor.tg_id, password }, null, headers);
    const stored = async (actor) => (await pool.query('SELECT password FROM users WHERE id=$1', [actor.id])).rows[0].password;
    const enableLegacy = () => { process.env.LEGACY_PASSWORD_LOGIN_UNTIL = new Date(Date.now() + 3600000).toISOString(); };

    await t.test('manager creates a long password as a hash; correct input logs in and hash does not', async () => {
        const password = '  Длинный🔐пароль'.repeat(200) + ' tail ';
        const tg_id = `password-created-${++sequence}`;
        const created = await post('/createUser', { fname: 'Long', lname: 'Test', tg_id, role: 2, post: 'Test', pass: password }, manager);
        assert.equal(created.status, 201);
        const actor = (await pool.query('SELECT id,tg_id FROM users WHERE tg_id=$1', [tg_id])).rows[0];
        const hash = await stored(actor);
        assert.equal(classifyPassword(hash), 'scrypt');
        assert.equal(JSON.stringify(created.data).includes(hash), false);
        assert.equal(JSON.stringify(created.data).includes(password), false);
        assert.equal((await login(actor, password)).status, 200);
        assert.equal((await login(actor, password.slice(0, -1))).status, 400);
        assert.equal((await login(actor, hash)).status, 400);
        assert.equal((await stored(actor)), hash);
    });

    await t.test('wrong user, wrong password, unusable hash and disabled legacy share one response', async () => {
        const actor = await user(await hashPassword('correct'));
        const legacy = await user('legacy-password');
        const corrupt = await user('scrypt$broken');
        const responses = [await login({ tg_id: 'password-missing' }, 'wrong'), await login(actor, 'wrong'),
            await login(legacy, 'legacy-password'), await login(corrupt, 'scrypt$broken')];
        for (const response of responses) {
            assert.equal(response.status, 400);
            assert.deepEqual(response.data, { message: 'Неверный логин или пароль' });
            assert.equal(response.headers.get('set-cookie'), null);
            assert.equal(response.headers.get('cache-control'), 'no-store');
        }
        assert.equal(await stored(legacy), 'legacy-password');
    });

    await t.test('legacy upgrade preserves long password, does not happen on failure, and works after disabling legacy', async () => {
        enableLegacy();
        const password = '  Старый😀'.repeat(160) + ' конец ';
        const actor = await user(password);
        assert.equal((await login(actor, 'wrong')).status, 400);
        assert.equal(await stored(actor), password);
        assert.equal((await login(actor, password)).status, 200);
        const hash = await stored(actor);
        assert.equal(classifyPassword(hash), 'scrypt');
        delete process.env.LEGACY_PASSWORD_LOGIN_UNTIL;
        assert.equal((await login(actor, password)).status, 200);
        assert.equal(await stored(actor), hash);
    });

    await t.test('expired or malformed legacy window never upgrades a plaintext record', async () => {
        const actor = await user('legacy-password');
        for (const value of ['invalid', '2030-01-01', new Date(Date.now() - 1000).toISOString()]) {
            process.env.LEGACY_PASSWORD_LOGIN_UNTIL = value;
            assert.equal((await login(actor, 'legacy-password')).status, 400);
        }
        assert.equal(await stored(actor), 'legacy-password');
    });

    await t.test('concurrent reset wins over a legacy login and no JWT is issued for old credential', async (subtest) => {
        enableLegacy();
        const actor = await user('old-password');
        const resetHash = await hashPassword('reset-password');
        const originalUpgrade = AuthModel.upgradePassword;
        subtest.mock.method(AuthModel, 'upgradePassword', async (...args) => {
            await pool.query('UPDATE users SET password=$1 WHERE id=$2', [resetHash, actor.id]);
            return originalUpgrade(...args);
        });
        const response = await login(actor, 'old-password');
        assert.equal(response.status, 400);
        assert.equal(response.data.user, undefined);
        assert.equal(response.headers.get('set-cookie'), null);
        assert.equal(await stored(actor), resetHash);
        assert.equal((await login(actor, 'reset-password')).status, 200);
    });

    await t.test('parallel legacy logins recheck the winner and preserve the same credential', async () => {
        enableLegacy();
        const actor = await user('parallel-password');
        const responses = await Promise.all([login(actor, 'parallel-password'), login(actor, 'parallel-password')]);
        assert.deepEqual(responses.map((r) => r.status), [200, 200]);
        assert.equal((await verifyPassword('parallel-password', await stored(actor))).matches, true);
    });

    await t.test('recovery accepts more than 1024 characters and saves only a hash', async () => {
        const actor = await user('old-password');
        const token = await post('/recAns', { tg_id: actor.tg_id, secAns: 'synthetic-answer' });
        assert.equal(token.status, 200);
        const password = '🔐New password '.repeat(200);
        const response = await post('/recPass/newPass', { tg_id: actor.tg_id, recoveryToken: token.data.recoveryToken, textNewPassword: password });
        assert.equal(response.status, 200);
        assert.equal((await verifyPassword(password, await stored(actor))).matches, true);
        assert.equal((await login(actor, password)).status, 200);
        assert.equal((await post('/recPass/newPass', { tg_id: actor.tg_id, recoveryToken: token.data.recoveryToken, textNewPassword: password })).status, 403);
    });

    await t.test('account limit applies to successful attempts and cannot be reset by changing IP', async () => {
        const actor = await user(await hashPassword('correct'));
        for (let i = 0; i < 10; i++) assert.equal((await login(actor, 'correct', { 'X-Forwarded-For': `192.0.2.${i}` })).status, 200);
        const limited = await login(actor, 'correct');
        assert.equal(limited.status, 429);
        assert.equal(limited.headers.get('retry-after'), '900');
        assert.equal(limited.headers.get('set-cookie'), null);
        time += 900000;
        assert.equal((await login(actor, 'correct')).status, 200);
    });

    await t.test('IP limit covers different accounts and malformed passwords before DB/KDF', async () => {
        for (let i = 0; i < 60; i++) {
            assert.equal((await post('/login', { tg_id: `password-absent-${i}`, password: null })).status, 400);
        }
        assert.equal((await post('/login', { tg_id: 'password-another', password: null })).status, 429);
    });

    await t.test('bounded hashing and database errors return safe responses without JWT', async (subtest) => {
        subtest.mock.method(AuthModel, 'findUserByTGid', async () => { throw Object.assign(new Error('private-data'), { code: 'PASSWORD_HASH_BUSY' }); });
        const busy = await login({ tg_id: 'password-test' }, 'secret');
        assert.equal(busy.status, 503);
        assert.equal(busy.headers.get('retry-after'), '1');
        AuthModel.findUserByTGid = async () => { throw new Error('private-SQL-data'); };
        const failed = await login({ tg_id: 'password-test' }, 'secret');
        assert.equal(failed.status, 500);
        assert.deepEqual(failed.data, { message: 'Ошибка сервера' });
        assert.equal(failed.headers.get('set-cookie'), null);
    });
});
