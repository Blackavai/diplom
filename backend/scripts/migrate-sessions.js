// Только добавление версии сессий; существующие поля и пароли не изменяются.
async function migrateSessions(pool, { apply = false, expectedDatabase } = {}) {
    if (!expectedDatabase) throw new Error('Explicit target database required');
    const client = await pool.connect();
    try {
        await client.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '30s'");
        const database = await client.query('SELECT current_database() AS name');
        if (database.rows[0].name !== expectedDatabase) throw new Error('Target database mismatch');
        const table = await client.query("SELECT to_regclass('public.users') AS name");
        if (!table.rows[0].name) throw new Error('Users table missing');
        // Блокировка исключает одновременное изменение схемы двумя запусками.
        if (apply) await client.query('LOCK TABLE public.users IN ACCESS EXCLUSIVE MODE');
        const column = await client.query(`SELECT data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'session_version'`);
        const exists = column.rowCount === 1;
        if (exists) {
            const definition = column.rows[0];
            if (definition.data_type !== 'integer' || definition.is_nullable !== 'NO' || definition.column_default !== '0') {
                throw new Error('Incompatible session column');
            }
            const invalid = await client.query('SELECT 1 FROM public.users WHERE session_version < 0 LIMIT 1');
            if (invalid.rowCount) throw new Error('Invalid session values');
        } else if (apply) {
            await client.query('ALTER TABLE public.users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0');
        }
        await client.query('COMMIT');
        let status = 'would-add';
        if (exists) status = 'already-present';
        else if (apply) status = 'added';
        return { mode: apply ? 'apply' : 'dry-run', status };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function main(args) {
    if (args.length === 1 && args[0] === '--help') {
        console.log('node scripts/migrate-sessions.js [--dry-run | --apply] --database=<expected-database>');
        return;
    }
    const targets = args.filter((arg) => arg.startsWith('--database='));
    if (targets.length !== 1 || !targets[0].slice(11) || new Set(args).size !== args.length ||
        args.some((arg) => !['--apply', '--dry-run'].includes(arg) && !arg.startsWith('--database=')) ||
        (args.includes('--apply') && args.includes('--dry-run'))) throw new Error('Invalid migration arguments');
    const pool = require('../db');
    try {
        console.log(JSON.stringify(await migrateSessions(pool, {
            apply: args.includes('--apply'), expectedDatabase: targets[0].slice(11)
        })));
    } finally {
        await pool.end();
    }
}

if (require.main === module) main(process.argv.slice(2)).catch(() => {
    console.error('Миграция сессий не выполнена. Проверьте параметры, схему и подключение; подробности БД не выводятся.');
    process.exitCode = 1;
});

module.exports = { migrateSessions };
