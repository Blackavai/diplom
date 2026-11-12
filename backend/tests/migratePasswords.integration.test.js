const { test } = require('node:test');
const assert = require('node:assert/strict');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);

test('password migration only on a separate synthetic database', { skip: process.env.RECOVERY_TEST_DATABASE !== '1' }, async (t) => {
    assert.equal(process.env.NODE_ENV, 'test');
    assert.equal(process.env.DB_HOST, 'recovery-db');
    assert.equal(process.env.DB_NAME, 'dailysync_recovery_test');
    const admin = require('../db');
    t.after(() => admin.end());
    const name = 'dailysync_password_migration_test';
    await admin.query(`CREATE DATABASE ${name}`);
    const pool = new (require('pg').Pool)({ host: 'recovery-db', port: 5432, database: name,
        user: process.env.DB_USER, password: process.env.DB_PASSWORD });
    t.after(() => pool.end());
    await pool.query('CREATE TABLE users (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, password text, label text)');
    const { migratePasswords } = require('../scripts/migrate-passwords');
    const { hashPassword, verifyPassword } = require('../utils/passwords');
    const hash = await hashPassword('already-hashed');
    const passwords = ['short', ' Длинный😀'.repeat(200), hash, null, 'scrypt$broken'];
    for (let i = 0; i < passwords.length; i++) await pool.query('INSERT INTO users(password,label) VALUES ($1,$2)', [passwords[i], `test-${i}`]);
    const snapshot = async () => (await pool.query('SELECT * FROM users ORDER BY id')).rows;

    await t.test('dry-run is read-only and prints only counters; wrong target is rejected', async () => {
        const before = await snapshot();
        const summary = await migratePasswords(pool, { expectedDatabase: name });
        assert.deepEqual(summary, { mode: 'dry-run', scanned: 5, scrypt: 1, legacy: 2, unusable: 2, converted: 0, conflicts: 0 });
        assert.deepEqual(await snapshot(), before);
        await assert.rejects(migratePasswords(pool, { apply: true, expectedDatabase: 'wrong-database' }));
        assert.deepEqual(await snapshot(), before);
        assert.equal(JSON.stringify(summary).includes(hash), false);
        assert.equal(JSON.stringify(summary).includes(passwords[1]), false);
    });

    await t.test('apply preserves each original password and other data; repeated apply is idempotent', async () => {
        const before = await snapshot();
        const first = await migratePasswords(pool, { apply: true, expectedDatabase: name });
        assert.equal(first.converted, 2);
        const after = await snapshot();
        for (let i = 0; i < 2; i++) assert.equal((await verifyPassword(passwords[i], after[i].password)).matches, true);
        assert.deepEqual(after.map((row) => row.label), before.map((row) => row.label));
        assert.deepEqual(after.slice(2), before.slice(2));
        assert.equal((await migratePasswords(pool, { apply: true, expectedDatabase: name })).converted, 0);
        assert.deepEqual(await snapshot(), after);
    });

    await t.test('migration compare-and-set cannot overwrite a concurrent reset', async () => {
        const row = (await pool.query("INSERT INTO users(password,label) VALUES ('old-race','race') RETURNING id")).rows[0];
        const resetHash = await hashPassword('reset-wins');
        const wrapper = { connect: async () => {
            const client = await pool.connect();
            return { release: () => client.release(), query: async (text, values) => {
                if (text.startsWith('UPDATE users SET password') && values[1] === row.id) {
                    await client.query('UPDATE users SET password=$1 WHERE id=$2', [resetHash, row.id]);
                }
                return client.query(text, values);
            } };
        } };
        const summary = await migratePasswords(wrapper, { apply: true, expectedDatabase: name });
        assert.equal(summary.conflicts, 1);
        assert.equal((await pool.query('SELECT password FROM users WHERE id=$1', [row.id])).rows[0].password, resetHash);
    });

    await t.test('CLI defaults to dry-run and rejects apply without explicit target before connecting', async () => {
        const before = await snapshot();
        const { stdout } = await execFile(process.execPath, ['scripts/migrate-passwords.js', `--database=${name}`], {
            env: { ...process.env, DB_NAME: name }, timeout: 10000
        });
        assert.equal(JSON.parse(stdout).mode, 'dry-run');
        assert.deepEqual(await snapshot(), before);
        const help = await execFile(process.execPath, ['scripts/migrate-passwords.js', '--help'], {
            env: { ...process.env, DB_HOST: 'unreachable.invalid' }, timeout: 10000
        });
        assert.ok(help.stdout.includes('--dry-run'));
        await assert.rejects(execFile(process.execPath, ['scripts/migrate-passwords.js', '--apply'], {
            env: { ...process.env, DB_HOST: 'unreachable.invalid' }, timeout: 10000
        }));
    });

    await t.test('pagination does not silently skip explicit nonpositive primary keys', async () => {
        await pool.query("INSERT INTO users(id,password,label) OVERRIDING SYSTEM VALUE VALUES (-1,'negative-id-password','negative-id')");
        const summary = await migratePasswords(pool, { apply: true, expectedDatabase: name });
        assert.equal(summary.converted, 1);
        const row = (await pool.query('SELECT password FROM users WHERE id=-1')).rows[0];
        assert.equal((await verifyPassword('negative-id-password', row.password)).matches, true);
    });
});
