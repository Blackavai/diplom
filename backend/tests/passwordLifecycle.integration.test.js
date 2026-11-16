const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

test('recommended password change and manager reset over HTTP/SQL', {
    skip: process.env.RECOVERY_TEST_DATABASE !== '1'
}, async (t) => {
    assert.equal(process.env.NODE_ENV, 'test');
    assert.equal(process.env.DB_HOST, 'recovery-db');
    assert.equal(process.env.DB_NAME, 'dailysync_recovery_test');
    const pool = require('../db');
    t.after(() => pool.end());
    const express = require('express');
    const jwt = require('jsonwebtoken');
    const AuthModel = require('../models/authModel');
    const { hashPassword, verifyPassword } = require('../utils/passwords');
    const { passwordAttempts, loginAttempts, createLoginAttempts } = require('../utils/loginAttempts');
    t.beforeEach(() => {
        Object.assign(passwordAttempts, createLoginAttempts());
        Object.assign(loginAttempts, createLoginAttempts());
    });
    const app = express();
    app.use(express.json());
    app.use('/api/auth', require('../routes/authRoutes'));
    app.use('/api/users', require('../routes/userRoutes'));
    app.use('/api/tasks', require('../routes/taskRoutes'));
    app.use('/api', require('../middleware/errorMiddleware').apiNotFound);
    app.use(require('../middleware/errorMiddleware').apiErrorHandler);
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    let sequence = 0;
    const originalPassword = 'Synthetic initial password';
    const managerPassword = 'Synthetic manager password';
    async function user(role = 2, recommended = false, password = originalPassword) {
        const row = (await pool.query(`INSERT INTO users(fname,lname,tg_id,post,role,password,password_change_recommended,question,answer)
            VALUES ('Lifecycle','Test',$1,'Test',$2,$3,$4,'Synthetic question','Synthetic answer') RETURNING id,tg_id`,
        [`password-lifecycle-${++sequence}`, role, await hashPassword(password), recommended])).rows[0];
        return { ...row, password, token: jwt.sign({ id: row.id, sessionVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' }) };
    }
    const manager = await user(1, false, managerPassword);
    async function request(path, actor, body, headers = {}) {
        const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Auth-Mode': 'bearer',
                ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}), ...headers },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        return { status: response.status, data: await response.json(), headers: response.headers };
    }
    const change = (actor, password, current = actor.password, extra = {}) => request('/api/auth/change-password', actor,
        { currentPassword: current, newPassword: password, confirmPassword: password, ...extra });
    const reset = (actor, target, password, current = actor.password, extra = {}) => request(`/api/auth/users/${target.id}/reset-password`, actor,
        { currentPassword: current, newPassword: password, confirmPassword: password, ...extra });
    const stored = async (actor) => (await pool.query('SELECT password,session_version,password_change_recommended FROM users WHERE id=$1', [actor.id])).rows[0];
    const login = (actor, password) => request('/api/auth/login', null, { tg_id: actor.tg_id, password });

    await t.test('created worker and manager get a recommendation and retain business access', async () => {
        for (const role of [1, 2]) {
            const account = `password-lifecycle-created-${++sequence}`;
            const created = await request('/api/auth/createUser', manager, {
                fname: 'New', lname: 'User', post: 'Test', role, tg_id: account, pass: originalPassword
            });
            assert.equal(created.status, 201);
            const actor = { id: created.data.user.id, tg_id: account };
            assert.equal((await stored(actor)).password_change_recommended, true);
            const signed = await login(actor, originalPassword);
            assert.equal(signed.data.user.passwordChangeRecommended, true);
            actor.token = signed.data.user.token;
            const protectedResponse = await request('/api/auth/protected', actor);
            assert.equal(protectedResponse.data.user.passwordChangeRecommended, true);
            assert.equal((await request(role === 1 ? '/api/users' : `/api/users/${actor.id}/tasks`, actor)).status, role === 1 ? 200 : 201);
            assert.equal(JSON.stringify(created.data).includes(originalPassword), false);
        }
    });
    await t.test('existing account stays unrestricted and without recommendation', async () => {
        const actor = await user();
        assert.equal((await login(actor, actor.password)).data.user.passwordChangeRecommended, false);
        assert.equal((await request(`/api/users/${actor.id}/tasks`, actor)).status, 201);
    });
    await t.test('own change preserves Unicode/spaces, clears recommendation and revokes all old sessions', async () => {
        const actor = await user(2, true);
        const other = await user();
        const password = '  Личный🔐пароль'.repeat(180) + ' end ';
        const result = await change(actor, password, actor.password, { id: other.id });
        assert.equal(result.status, 200);
        const row = await stored(actor);
        assert.equal(row.password_change_recommended, false);
        assert.equal(row.session_version, 1);
        assert.equal((await verifyPassword(password, row.password)).matches, true);
        assert.equal((await stored(other)).session_version, 0);
        assert.equal((await request('/api/auth/protected', actor)).status, 401);
        assert.equal((await login(actor, originalPassword)).status, 400);
        const signed = await login(actor, password);
        assert.equal(signed.status, 200);
        assert.equal(signed.data.user.passwordChangeRecommended, false);
        assert.equal(JSON.stringify(result.data).includes(password), false);
        assert.equal(JSON.stringify(result.data).includes(row.password), false);
    });
    await t.test('wrong current password, same password, mismatch and invalid types preserve credentials', async () => {
        const actor = await user();
        const before = await stored(actor);
        assert.equal((await change(actor, 'Different', 'Wrong')).status, 403);
        assert.equal((await change(actor, actor.password)).status, 400);
        assert.equal((await change(actor, 'Different', actor.password, { confirmPassword: 'Mismatch' })).status, 400);
        for (const value of [null, {}, [], 10, true, '   ']) {
            assert.equal((await change(actor, value)).status, 400);
        }
        assert.deepEqual(await stored(actor), before);
    });
    await t.test('anonymous and worker cannot administratively reset; invalid ids and self reset fail', async () => {
        const actor = await user();
        assert.equal((await change(null, 'New', 'Old')).status, 401);
        assert.equal((await reset(actor, manager, 'New')).status, 403);
        assert.equal((await reset(null, actor, 'New', 'Old')).status, 401);
        assert.equal((await reset(manager, manager, 'New')).status, 400);
        assert.equal((await reset(manager, { id: 'bad' }, 'New')).status, 400);
        assert.equal((await reset(manager, { id: 2147483647 }, 'New')).status, 404);
    });
    await t.test('manager must confirm own password; failure neither changes nor revokes target', async () => {
        const actor = await user();
        const before = await stored(actor);
        assert.equal((await reset(manager, actor, 'New', 'Wrong')).status, 403);
        assert.deepEqual(await stored(actor), before);
    });
    await t.test('manager resets another worker or manager and retains own session', async () => {
        for (const role of [1, 2]) {
            const actor = await user(role);
            const result = await reset(manager, actor, 'Newly assigned password');
            assert.equal(result.status, 200);
            assert.equal(result.headers.get('cache-control'), 'no-store');
            assert.equal((await stored(actor)).password_change_recommended, true);
            assert.equal((await request('/api/auth/protected', actor)).status, 401);
            assert.equal((await request('/api/auth/protected', manager)).status, 200);
            assert.equal((await login(actor, actor.password)).status, 400);
            assert.equal((await login(actor, 'Newly assigned password')).data.user.passwordChangeRecommended, true);
            assert.deepEqual(Object.keys(result.data).sort(), ['message', 'success']);
        }
    });
    await t.test('cookie password changes require the matching CSRF proof', async () => {
        const actor = await user();
        const signed = await fetch(base + '/api/auth/login', { method: 'POST', headers: {
            'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest'
        }, body: JSON.stringify({ tg_id: actor.tg_id, password: actor.password }) });
        const cookie = signed.headers.get('set-cookie').split(';')[0];
        assert.equal((await signed.json()).user.token, undefined);
        const session = await (await fetch(base + '/api/auth/protected', { headers: { Cookie: cookie } })).json();
        const body = { currentPassword: actor.password, newPassword: 'Personal password', confirmPassword: 'Personal password' };
        const post = (proof) => fetch(base + '/api/auth/change-password', { method: 'POST',
            headers: { Cookie: cookie, 'Content-Type': 'application/json', ...proof }, body: JSON.stringify(body) });
        assert.equal((await post({})).status, 403);
        assert.equal((await post({ 'X-Session-Id': session.sessionId, 'X-CSRF-Token': session.csrfToken })).status, 200);
        assert.equal((await fetch(base + '/api/auth/protected', { headers: { Cookie: cookie } })).status, 401);
    });
    await t.test('concurrent own changes produce one success and one conflict', async (subtest) => {
        const actor = await user();
        const original = AuthModel.changeOwnPassword;
        let entered = 0;
        let release;
        const barrier = new Promise((resolve) => { release = resolve; });
        subtest.mock.method(AuthModel, 'changeOwnPassword', async (...args) => {
            if (++entered === 2) release();
            await barrier;
            return original(...args);
        });
        const results = await Promise.all([change(actor, 'First password'), change(actor, 'Second password')]);
        assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
        assert.equal((await stored(actor)).session_version, 1);
    });
    await t.test('concurrent manager resets commit one password and reject the stale snapshot', async (subtest) => {
        const actor = await user();
        const secondManager = await user(1);
        const original = AuthModel.resetUserPassword;
        let entered = 0;
        let release;
        const barrier = new Promise((resolve) => { release = resolve; });
        subtest.mock.method(AuthModel, 'resetUserPassword', async (...args) => {
            if (++entered === 2) release();
            await barrier;
            return original(...args);
        });
        const results = await Promise.all([reset(manager, actor, 'First assigned'), reset(secondManager, actor, 'Second assigned')]);
        assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
        assert.equal((await stored(actor)).session_version, 1);
        assert.equal((await verifyPassword(results[0].status === 200 ? 'First assigned' : 'Second assigned', (await stored(actor)).password)).matches, true);
    });
    await t.test('a delayed manager reset cannot overwrite a completed personal change', async (subtest) => {
        const actor = await user();
        const original = AuthModel.resetUserPassword;
        subtest.mock.method(AuthModel, 'resetUserPassword', async (...args) => {
            assert.equal((await change(actor, 'Chosen personally')).status, 200);
            return original(...args);
        });
        assert.equal((await reset(manager, actor, 'Stale reset')).status, 409);
        assert.equal((await verifyPassword('Chosen personally', (await stored(actor)).password)).matches, true);
    });
    await t.test('reset rechecks manager role and version after password verification', async (subtest) => {
        const actor = await user();
        const temporaryManager = await user(1);
        const original = AuthModel.resetUserPassword;
        const before = await stored(actor);
        subtest.mock.method(AuthModel, 'resetUserPassword', async (...args) => {
            await pool.query('UPDATE users SET role=2 WHERE id=$1', [temporaryManager.id]);
            return original(...args);
        });
        assert.equal((await reset(temporaryManager, actor, 'Must not apply')).status, 409);
        assert.deepEqual(await stored(actor), before);
    });
    await t.test('SQL refusal rolls back reset and session revocation without leaking details', async () => {
        const actor = await user();
        const before = await stored(actor);
        await pool.query(`CREATE FUNCTION lifecycle_reject_reset() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'synthetic-private-lifecycle-detail'; END $$`);
        await pool.query(`CREATE TRIGGER lifecycle_reject_reset BEFORE UPDATE ON users FOR EACH ROW
            WHEN (OLD.id=${actor.id}) EXECUTE FUNCTION lifecycle_reject_reset()`);
        try {
            const result = await reset(manager, actor, 'Must rollback');
            assert.equal(result.status, 500);
            assert.equal(JSON.stringify(result.data).includes('synthetic-private-lifecycle-detail'), false);
            assert.deepEqual(await stored(actor), before);
        } finally {
            await pool.query('DROP TRIGGER lifecycle_reject_reset ON users');
            await pool.query('DROP FUNCTION lifecycle_reject_reset()');
        }
    });
    await t.test('reset invalidates an already issued legacy recovery grant', async () => {
        const actor = await user();
        const oldGrant = require('../utils/passwordRecovery').recovery.issue(actor.id, actor.tg_id);
        assert.equal((await reset(manager, actor, 'Assigned after grant')).status, 200);
        const before = await stored(actor);
        assert.equal((await request('/api/auth/recPass/newPass', null, {
            tg_id: actor.tg_id, recoveryToken: oldGrant, textNewPassword: 'Stale recovery'
        })).status, 410);
        assert.deepEqual(await stored(actor), before);
    });
    await t.test('OpenAPI documents both password operations and the three retired routes', async () => {
        const specification = require('swagger-jsdoc')({
            definition: { openapi: '3.0.0', info: { title: 'Test', version: '1' } },
            apis: ['./routes/*.js'], failOnErrors: true
        });
        for (const path of ['/api/auth/change-password', '/api/auth/users/{id}/reset-password']) {
            assert.deepEqual(specification.paths[path].post.requestBody.content['application/json'].schema.required,
                ['currentPassword', 'newPassword', 'confirmPassword']);
        }
        for (const path of ['/api/auth/recPass', '/api/auth/recAns', '/api/auth/recPass/newPass']) {
            assert.equal(specification.paths[path].post.deprecated, true);
            assert.deepEqual(specification.paths[path].post.security, []);
            assert.ok(specification.paths[path].post.responses['410']);
        }
    });
    await t.test('password verification attempts have account/IP limits and Retry-After', async () => {
        const actor = await user();
        for (let index = 0; index < 10; index++) assert.equal((await change(actor, 'New', 'Wrong')).status, 403);
        const limited = await change(actor, 'New', 'Wrong');
        assert.equal(limited.status, 429);
        assert.equal(limited.headers.get('retry-after'), '900');
    });
});
