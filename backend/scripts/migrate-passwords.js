const { classifyPassword, hashPassword } = require('../utils/passwords');

async function migratePasswords(pool, { apply = false, expectedDatabase } = {}) {
    if (!expectedDatabase) throw new Error('Explicit target database required');
    const client = await pool.connect();
    let readTransaction = false;
    const result = { mode: apply ? 'apply' : 'dry-run', scanned: 0, scrypt: 0, legacy: 0, unusable: 0, converted: 0, conflicts: 0 };
    try {
        if (!apply) { await client.query('BEGIN READ ONLY'); readTransaction = true; }
        const database = await client.query('SELECT current_database() AS name');
        if (database.rows[0].name !== expectedDatabase) throw new Error('Target database mismatch');
        let lastId = null;
        while (true) {
            const batch = await client.query('SELECT id, password FROM users WHERE ($1::integer IS NULL OR id > $1) ORDER BY id LIMIT 100', [lastId]);
            if (!batch.rowCount) break;
            for (const user of batch.rows) {
                lastId = user.id;
                result.scanned++;
                const kind = classifyPassword(user.password);
                result[kind]++;
                if (apply && kind === 'legacy') {
                    const hash = await hashPassword(user.password);
                    // Autocommit per row, compare-and-set; resumable without overwriting a reset.
                    const updated = await client.query('UPDATE users SET password = $1 WHERE id = $2 AND password = $3', [hash, user.id, user.password]);
                    if (updated.rowCount === 1) result.converted++; else result.conflicts++;
                }
            }
        }
        if (readTransaction) { await client.query('COMMIT'); readTransaction = false; }
        return result;
    } catch (error) {
        if (readTransaction) await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function main(args) {
    if (args.length === 1 && args[0] === '--help') {
        console.log('node scripts/migrate-passwords.js [--dry-run | --apply] --database=<expected-database>');
        return;
    }
    const target = args.filter((arg) => arg.startsWith('--database='));
    if (target.length !== 1 || !target[0].slice(11) || args.some((arg) => !['--apply', '--dry-run'].includes(arg) && !arg.startsWith('--database=')) ||
        (args.includes('--apply') && args.includes('--dry-run'))) throw new Error('Invalid migration arguments');
    // Load dotenv/pg only after explicit CLI target validation. No connection on import/help.
    const pool = require('../db');
    try {
        const result = await migratePasswords(pool, { apply: args.includes('--apply'), expectedDatabase: target[0].slice(11) });
        console.log(JSON.stringify(result));
    } finally {
        await pool.end();
    }
}

if (require.main === module) main(process.argv.slice(2)).catch(() => {
    console.error('Преобразование паролей не выполнено или прервано. Проверьте параметры и подключение; повторный запуск безопасен для уже преобразованных записей.');
    process.exitCode = 1;
});

module.exports = { migratePasswords };
