const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

test('session revocation over HTTP on synthetic PostgreSQL', { skip: process.env.RECOVERY_TEST_DATABASE !== '1' }, async (t) => {
    assert.equal(process.env.NODE_ENV, 'test');
    assert.equal(process.env.DB_HOST, 'recovery-db');
    assert.equal(process.env.DB_NAME, 'dailysync_recovery_test');
    const pool = require('../db');
    t.after(() => pool.end());
    const jwt = require('jsonwebtoken');
    const express = require('express');
    const AuthModel = require('../models/authModel');
    const { hashPassword } = require('../utils/passwords');
    const { loginAttempts, createLoginAttempts } = require('../utils/loginAttempts');
    t.beforeEach(() => Object.assign(loginAttempts, createLoginAttempts()));
    const app = express();
    app.use(express.json());
    app.use('/api/auth', require('../routes/authRoutes'));
    app.use('/api', require('../middleware/errorMiddleware').apiNotFound);
    app.use(require('../middleware/errorMiddleware').apiErrorHandler);
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/api/auth`;
    const actor = (await pool.query(`INSERT INTO users(fname,lname,tg_id,role,post,password,question,answer)
        VALUES ('Session','Test','session-worker',2,'Test',$1,'Synthetic question','synthetic-answer') RETURNING id`,
    [await hashPassword('session-password')])).rows[0];
    const other = (await pool.query(`INSERT INTO users(fname,lname,tg_id,role,post,password)
        VALUES ('Other','Test','session-other',1,'Test',$1) RETURNING id`, [await hashPassword('other-password')])).rows[0];
    async function request(path, token, body) {
        const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Auth-Mode': 'bearer', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        return { status: response.status, data: await response.json(), headers: response.headers };
    }
    const login = async (password = 'session-password') => {
        const response = await request('/login', null, { tg_id: 'session-worker', password });
        assert.equal(response.status, 200);
        return response.data.user.token;
    };
    const version = async () => (await pool.query('SELECT session_version FROM users WHERE id=$1', [actor.id])).rows[0].session_version;
    const sign = (claims) => jwt.sign(claims, process.env.JWT_SECRET, { expiresIn: '1h' });

    await t.test('login includes numeric version; safe DTOs omit internal version', async () => {
        const token = await login();
        assert.equal(jwt.verify(token, process.env.JWT_SECRET).sessionVersion, 0);
        const current = await request('/protected', token);
        assert.equal(current.status, 200);
        assert.equal(current.headers.get('cache-control'), 'no-store');
        assert.deepEqual(Object.keys(current.data.user).sort(), ['fname','id','lname','post','role','tg_id']);
    });
    await t.test('legacy, negative, fractional, string and mismatched versions fail closed', async () => {
        for (const value of [undefined, null, -1, 0.5, '0', 1, 2147483648]) {
            const token = sign({ id: actor.id, ...(value === undefined ? {} : { sessionVersion: value }) });
            assert.equal((await request('/protected', token)).status, 401);
        }
        assert.equal(await version(), 0);
        assert.equal((await request('/logout', null, {})).status, 401);
    });
    await t.test('logout revokes all devices, leaves other users and new login intact', async () => {
        const first = await login();
        const second = sign({ id: actor.id, sessionVersion: 0, device: 'second' });
        const otherToken = sign({ id: other.id, sessionVersion: 0 });
        const response = await request('/logout', first, {});
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('set-cookie'), null);
        assert.equal(await version(), 1);
        assert.equal((await request('/protected', first)).status, 401);
        assert.equal((await request('/protected', second)).status, 401);
        assert.equal((await request('/protected', otherToken)).status, 200);
        const fresh = await login();
        assert.equal((await request('/logout', first, {})).status, 401);
        assert.equal((await request('/protected', fresh)).status, 200);
    });
    await t.test('late already-authenticated logout cannot revoke a subsequent login', async (subtest) => {
        const old = await login();
        const original = AuthModel.revokeSessions;
        let fresh;
        subtest.mock.method(AuthModel, 'revokeSessions', async (id, expected) => {
            assert.equal(await original(id, expected), true);
            fresh = await login();
            return original(id, expected);
        });
        assert.equal((await request('/logout', old, {})).status, 200);
        assert.equal((await request('/protected', fresh)).status, 200);
    });
    await t.test('reset changes password and revokes sessions in the same update', async () => {
        const old = await login();
        const before = await version();
        const grant = await request('/recAns', null, { tg_id: 'session-worker', secAns: 'synthetic-answer' });
        assert.equal(grant.status, 200);
        const body = { tg_id: 'session-worker', recoveryToken: grant.data.recoveryToken, textNewPassword: 'reset-password' };
        assert.equal((await request('/recPass/newPass', null, body)).status, 200);
        assert.equal(await version(), before + 1);
        assert.equal((await request('/protected', old)).status, 401);
        assert.equal((await request('/login', null, { tg_id: 'session-worker', password: 'session-password' })).status, 400);
        assert.equal((await request('/protected', await login('reset-password'))).status, 200);
        assert.equal((await request('/recPass/newPass', null, body)).status, 403);
        assert.equal(await version(), before + 1);
    });
    await t.test('SQL failure rolls back password and version together', async () => {
        const before = (await pool.query('SELECT password,session_version FROM users WHERE id=$1', [actor.id])).rows[0];
        await pool.query(`CREATE FUNCTION session_fail_reset() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'synthetic-private-data'; END $$`);
        await pool.query(`CREATE TRIGGER session_reset_failure BEFORE UPDATE ON users
            FOR EACH ROW WHEN (OLD.id = ${actor.id}) EXECUTE FUNCTION session_fail_reset()`);
        try {
            const grant = await request('/recAns', null, { tg_id: 'session-worker', secAns: 'synthetic-answer' });
            const failed = await request('/recPass/newPass', null, { tg_id: 'session-worker', recoveryToken: grant.data.recoveryToken, textNewPassword: 'failed-reset' });
            assert.equal(failed.status, 500);
            assert.deepEqual(failed.data, { message: 'Ошибка сервера' });
            assert.deepEqual((await pool.query('SELECT password,session_version FROM users WHERE id=$1', [actor.id])).rows[0], before);
        } finally {
            await pool.query('DROP TRIGGER session_reset_failure ON users');
            await pool.query('DROP FUNCTION session_fail_reset()');
        }
    });
    await t.test('concurrent reset during password verification cannot produce a usable old-credential JWT', async (subtest) => {
        const original = AuthModel.findUserByTGid;
        subtest.mock.method(AuthModel, 'findUserByTGid', async (account) => {
            const previous = await original(account);
            await AuthModel.newPassword(actor.id, account, await hashPassword('race-password'));
            return previous;
        });
        const stale = await login('reset-password');
        assert.equal((await request('/protected', stale)).status, 401);
    });
    await t.test('database failure during logout is safe and does not report success', async (subtest) => {
        const token = await login('race-password');
        subtest.mock.method(AuthModel, 'revokeSessions', async () => { throw new Error('synthetic-private-SQL'); });
        const before = await version();
        const failed = await request('/logout', token, {});
        assert.equal(failed.status, 500);
        assert.deepEqual(failed.data, { message: 'Ошибка сервера' });
        assert.equal(await version(), before);
        assert.equal((await request('/protected', token)).status, 200);
    });
});
