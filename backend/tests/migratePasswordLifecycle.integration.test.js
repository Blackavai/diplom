const { test } = require('node:test');
const assert = require('node:assert/strict');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);

test('password recommendation migration and owner recovery on a separate synthetic database', {
    skip: process.env.RECOVERY_TEST_DATABASE !== '1'
}, async (t) => {
    assert.equal(process.env.NODE_ENV, 'test');
    assert.equal(process.env.DB_HOST, 'recovery-db');
    assert.equal(process.env.DB_NAME, 'dailysync_recovery_test');
    const admin = require('../db');
    t.after(() => admin.end());
    const database = 'dailysync_password_lifecycle_test';
    await admin.query(`CREATE DATABASE ${database}`);
    const pool = new (require('pg').Pool)({ host: 'recovery-db', database, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
    t.after(() => pool.end());
    const { migratePasswordLifecycle } = require('../scripts/migrate-password-lifecycle');
    const { resetManagerPassword } = require('../scripts/reset-manager-password');
    const { hashPassword, verifyPassword } = require('../utils/passwords');
    await pool.query(`CREATE TABLE users(id integer PRIMARY KEY, role integer, password text,
        session_version integer NOT NULL DEFAULT 0, question text, answer text)`);
    await pool.query("INSERT INTO users VALUES (1,1,$1,7,'Saved question','Saved answer'),(2,2,NULL,0,NULL,NULL)", [await hashPassword('Owner old password')]);
    const snapshot = async () => (await pool.query('SELECT * FROM users ORDER BY id')).rows;
    const migrate = (options = {}) => migratePasswordLifecycle(pool, { expectedDatabase: database, ...options });
    await t.test('dry-run and wrong target leave schema and values unchanged', async () => {
        const before = await snapshot();
        assert.deepEqual(await migrate(), { mode: 'dry-run', status: 'would-add' });
        await assert.rejects(migratePasswordLifecycle(pool, { apply: true }));
        await assert.rejects(migrate({ apply: true, expectedDatabase: 'wrong' }));
        assert.deepEqual(await snapshot(), before);
    });
    await t.test('apply only adds a false recommendation; repeat preserves true and credentials', async () => {
        const before = await snapshot();
        assert.equal((await migrate({ apply: true })).status, 'added');
        const after = await snapshot();
        assert.deepEqual(after.map(({ password_change_recommended, ...row }) => row), before);
        assert.equal(after.every((row) => row.password_change_recommended === false), true);
        await pool.query('UPDATE users SET password_change_recommended=true WHERE id=2');
        assert.equal((await migrate({ apply: true })).status, 'already-present');
        assert.equal((await snapshot())[1].password_change_recommended, true);
    });
    await t.test('incompatible nullable definition is rejected without repair', async () => {
        await pool.query('ALTER TABLE users ALTER COLUMN password_change_recommended DROP NOT NULL');
        const before = await snapshot();
        await assert.rejects(migrate({ apply: true }));
        assert.deepEqual(await snapshot(), before);
        await pool.query('ALTER TABLE users ALTER COLUMN password_change_recommended SET NOT NULL');
    });
    await t.test('owner dry-run and invalid targets never change a password', async () => {
        const before = await snapshot();
        assert.deepEqual(await resetManagerPassword(pool, { expectedDatabase: database, userId: 1 }), { mode: 'dry-run', status: 'would-reset' });
        for (const userId of [2, 999]) await assert.rejects(resetManagerPassword(pool, { expectedDatabase: database, userId, password: 'New', apply: true }));
        await assert.rejects(resetManagerPassword(pool, { expectedDatabase: 'wrong', userId: 1, password: 'New', apply: true }));
        assert.deepEqual(await snapshot(), before);
    });
    await t.test('owner resets the last manager without changing roles, questions or other accounts', async () => {
        const before = await snapshot();
        const password = '  Owner new 🔐 password ';
        const result = await resetManagerPassword(pool, { expectedDatabase: database, userId: 1, password, apply: true });
        assert.deepEqual(result, { mode: 'apply', status: 'reset' });
        const after = await snapshot();
        assert.equal((await verifyPassword(password, after[0].password)).matches, true);
        assert.equal(after[0].session_version, 8);
        assert.equal(after[0].password_change_recommended, true);
        assert.equal(after[0].role, before[0].role);
        assert.equal(after[0].question, before[0].question);
        assert.equal(after[0].answer, before[0].answer);
        assert.deepEqual(after[1], before[1]);
        assert.equal(JSON.stringify(result).includes(password), false);
    });
    await t.test('CLI help/argument validation never connect or accept passwords in arguments', async () => {
        for (const file of ['migrate-password-lifecycle.js', 'reset-manager-password.js']) {
            const env = { ...process.env, DB_HOST: 'unreachable.invalid' };
            const { stdout } = await execFile(process.execPath, ['scripts/' + file, '--help'], { env, timeout: 10000 });
            assert.match(stdout, /--dry-run/);
            for (const args of [['--apply'], ['--database=' + database, '--password=secret']]) {
                await assert.rejects(execFile(process.execPath, ['scripts/' + file, ...args], { env, timeout: 10000 }));
            }
        }
        const { stdout } = await execFile(process.execPath, ['scripts/reset-manager-password.js', '--database=' + database, '--user-id=1'],
            { env: { ...process.env, DB_NAME: database }, timeout: 10000 });
        assert.deepEqual(JSON.parse(stdout), { mode: 'dry-run', status: 'would-reset' });
    });
});
