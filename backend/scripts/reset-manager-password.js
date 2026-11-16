const { hashPassword, isValidPassword } = require('../utils/passwords');


// Доступ к административному окружению принадлежит владельцу среды, не браузеру.
async function resetManagerPassword(pool, { expectedDatabase, userId, password, apply = false }) {
    if (!expectedDatabase || (!Number.isInteger(userId) || userId < 1 || userId > 2147483647) || (apply && !isValidPassword(password))) {
        throw new Error('Invalid reset parameters');
    }
    const client = await pool.connect();
    try {
        await client.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');
        await client.query("SET LOCAL lock_timeout='5s'");
        await client.query("SET LOCAL statement_timeout='30s'");
        if ((await client.query('SELECT current_database() AS name')).rows[0].name !== expectedDatabase) {
            throw new Error('Target database mismatch');
        }
        const result = await client.query('SELECT id, password, session_version FROM users WHERE id=$1 AND role=1', [userId]);
        const manager = result.rows[0];
        if (!manager) throw new Error('Manager not found');
        if (apply) {
            const hash = await hashPassword(password);
            const changed = await client.query(`UPDATE users SET password=$1,
                password_change_recommended=true, session_version=session_version+1
                WHERE id=$2 AND role=1 AND password IS NOT DISTINCT FROM $3 AND session_version=$4 RETURNING id`,
            [hash, manager.id, manager.password, manager.session_version]);
            if (changed.rowCount !== 1) throw new Error('Manager credentials changed');
        }
        await client.query('COMMIT');
        return { mode: apply ? 'apply' : 'dry-run', status: apply ? 'reset' : 'would-reset' };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function main(args) {
    if (args.length === 1 && args[0] === '--help') {
        console.log('node scripts/reset-manager-password.js [--dry-run | --apply] --database=<name> --user-id=<manager-id>');
        return;
    }
    const databases = args.filter((arg) => arg.startsWith('--database='));
    const users = args.filter((arg) => arg.startsWith('--user-id='));
    if (databases.length !== 1 || users.length !== 1 || !databases[0].slice(11) ||
        (!/^[1-9]\d*$/.test(users[0].slice(10)) || Number(users[0].slice(10)) > 2147483647) || new Set(args).size !== args.length ||
        args.some((arg) => !['--apply', '--dry-run'].includes(arg) && !arg.startsWith('--database=') && !arg.startsWith('--user-id=')) ||
        (args.includes('--apply') && args.includes('--dry-run'))) throw new Error('Invalid arguments');
    const options = { expectedDatabase: databases[0].slice(11), userId: Number(users[0].slice(10)), apply: args.includes('--apply') };
    const pool = require('./admin-pool')();
    try {
        await resetManagerPassword(pool, { ...options, apply: false });
        if (options.apply) {
            const readPassword = require('./read-password');
            options.password = await readPassword('Новый пароль менеджера: ');
            if (options.password !== await readPassword('Повторите пароль: ')) throw new Error('Passwords differ');
        }
        console.log(JSON.stringify(await resetManagerPassword(pool, options)));
    } finally {
        await pool.end();
    }
}

if (require.main === module) main(process.argv.slice(2)).catch(() => {
    console.error('Пароль менеджера не сброшен. Проверьте целевую БД, id менеджера и схему; секреты не выводятся.');
    process.exitCode = 1;
});
module.exports = { resetManagerPassword };
