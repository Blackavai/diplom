const { test } = require('node:test');
const assert = require('node:assert/strict');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);

test('session schema migration on a separate synthetic database', { skip: process.env.RECOVERY_TEST_DATABASE !== '1' }, async (t) => {
    assert.equal(process.env.NODE_ENV, 'test');
    assert.equal(process.env.DB_HOST, 'recovery-db');
    assert.equal(process.env.DB_NAME, 'dailysync_recovery_test');
    const admin = require('../db');
    t.after(() => admin.end());
    const name = 'dailysync_session_migration_test';
    await admin.query(`CREATE DATABASE ${name}`);
    const pool = new (require('pg').Pool)({ host: 'recovery-db', port: 5432, database: name,
        user: process.env.DB_USER, password: process.env.DB_PASSWORD });
    t.after(() => pool.end());
    const { migrateSessions } = require('../scripts/migrate-sessions');
    await pool.query('CREATE TABLE users (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, password text, label text)');
    await pool.query("INSERT INTO users(password,label) VALUES ('synthetic-secret','first'), (NULL,'second')");
    const snapshot = async () => (await pool.query('SELECT id,password,label FROM users ORDER BY id')).rows;
    const column = async () => (await pool.query("SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='session_version'")).rowCount;
    await t.test('dry-run, absent target and wrong target do not change schema or data', async () => {
        const before = await snapshot();
        assert.deepEqual(await migrateSessions(pool, { expectedDatabase: name }), { mode: 'dry-run', status: 'would-add' });
        await assert.rejects(migrateSessions(pool, { apply: true }));
        await assert.rejects(migrateSessions(pool, { apply: true, expectedDatabase: 'wrong' }));
        assert.equal(await column(), 0);
        assert.deepEqual(await snapshot(), before);
    });
    await t.test('apply preserves existing values, defaults old/new rows to zero and is repeatable', async () => {
        const before = await snapshot();
        assert.equal((await migrateSessions(pool, { apply: true, expectedDatabase: name })).status, 'added');
        assert.deepEqual(await snapshot(), before);
        assert.deepEqual((await pool.query('SELECT session_version FROM users')).rows, [{ session_version: 0 }, { session_version: 0 }]);
        assert.equal((await pool.query("INSERT INTO users(label) VALUES ('third') RETURNING session_version")).rows[0].session_version, 0);
        await pool.query('UPDATE users SET session_version=5 WHERE id=1');
        assert.equal((await migrateSessions(pool, { apply: true, expectedDatabase: name })).status, 'already-present');
        assert.equal((await pool.query('SELECT session_version FROM users WHERE id=1')).rows[0].session_version, 5);
        await assert.rejects(pool.query('UPDATE users SET session_version=NULL WHERE id=1'));
    });
    await t.test('incompatible schema and negative versions are rejected without repair', async () => {
        await pool.query('UPDATE users SET session_version=-1 WHERE id=1');
        await assert.rejects(migrateSessions(pool, { apply: true, expectedDatabase: name }));
        await pool.query('UPDATE users SET session_version=5 WHERE id=1');
        await pool.query('ALTER TABLE users ALTER COLUMN session_version DROP NOT NULL');
        await assert.rejects(migrateSessions(pool, { apply: true, expectedDatabase: name }));
        await pool.query('ALTER TABLE users ALTER COLUMN session_version SET NOT NULL');
    });
    await t.test('lock contention fails within timeout and leaves schema intact', async () => {
        const blocker = await pool.connect();
        await blocker.query('BEGIN');
        await blocker.query('LOCK TABLE users IN ACCESS EXCLUSIVE MODE');
        try {
            await assert.rejects(migrateSessions(pool, { apply: true, expectedDatabase: name }), { code: '55P03' });
        } finally {
            await blocker.query('ROLLBACK');
            blocker.release();
        }
        assert.equal((await migrateSessions(pool, { expectedDatabase: name })).status, 'already-present');
    });
    await t.test('CLI validates target before connecting; default is read-only with safe output', async () => {
        const before = await snapshot();
        const { stdout } = await execFile(process.execPath, ['scripts/migrate-sessions.js', `--database=${name}`], {
            env: { ...process.env, DB_NAME: name }, timeout: 10000 });
        assert.deepEqual(JSON.parse(stdout), { mode: 'dry-run', status: 'already-present' });
        assert.deepEqual(await snapshot(), before);
        const help = await execFile(process.execPath, ['scripts/migrate-sessions.js', '--help'], {
            env: { ...process.env, DB_HOST: 'unreachable.invalid' }, timeout: 10000 });
        assert.ok(help.stdout.includes('--apply'));
        for (const args of [['--apply'], ['--apply', '--dry-run', `--database=${name}`]]) {
            await assert.rejects(execFile(process.execPath, ['scripts/migrate-sessions.js', ...args], {
                env: { ...process.env, DB_HOST: 'unreachable.invalid' }, timeout: 10000 }));
        }
    });
});
