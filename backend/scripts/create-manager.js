const { hashPassword, isValidPassword } = require('../utils/passwords');
const { isValidUserText, isValidUserAccount } = require('../utils/userValidation');

async function createManager(pool, { expectedDatabase, account, firstName, lastName, position, password, apply = false }) {
    if (!expectedDatabase || !isValidUserAccount(account) || !isValidUserText(firstName) ||
        !isValidUserText(lastName) || !isValidUserText(position) || (apply && !isValidPassword(password))) {
        throw new Error('Invalid manager parameters');
    }
    const hash = apply ? await hashPassword(password) : null;
    const client = await pool.connect();
    try {
        await client.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');
        await client.query("SET LOCAL lock_timeout='5s'");
        if ((await client.query('SELECT current_database() AS name')).rows[0].name !== expectedDatabase) throw new Error('Target database mismatch');
        if (apply) await client.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
        const existing = await client.query('SELECT 1 FROM users WHERE role=1 OR tg_id=$1 LIMIT 1', [account]);
        if (existing.rowCount) throw new Error('A manager or this account already exists');
        if (apply) {
            const result = await client.query(`INSERT INTO users(fname,lname,tg_id,post,role,password)
                VALUES ($1,$2,$3,$4,1,$5) RETURNING id`, [firstName,lastName,account,position,hash]);
            if (result.rowCount !== 1) throw new Error('Manager not created');
        }
        await client.query('COMMIT');
        return { mode: apply ? 'apply' : 'dry-run', status: apply ? 'created' : 'would-create' };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
}

async function main(args) {
    if (args.length === 1 && args[0] === '--help') {
        console.log('node scripts/create-manager.js [--dry-run | --apply] --database=<name> --login=<login> --first-name=<name> --last-name=<name> --post=<position>');
        return;
    }
    const options = {};
    const names = { database: 'expectedDatabase', login: 'account', 'first-name': 'firstName', 'last-name': 'lastName', post: 'position' };
    for (const arg of args) {
        if (arg === '--apply' || arg === '--dry-run') continue;
        const match = /^--([a-z-]+)=(.+)$/.exec(arg);
        if (!match || !names[match[1]] || options[names[match[1]]]) throw new Error('Invalid arguments');
        options[names[match[1]]] = match[2];
    }
    if (new Set(args).size !== args.length || (args.includes('--apply') && args.includes('--dry-run'))) throw new Error('Invalid mode');
    options.apply = args.includes('--apply');
    if (options.apply) {
        const readPassword = require('./read-password');
        options.password = await readPassword('Пароль первого менеджера: ');
        if (options.password !== await readPassword('Повторите пароль: ')) throw new Error('Passwords differ');
    }
    const pool = require('./admin-pool')();
    try { console.log(JSON.stringify(await createManager(pool, options))); }
    finally { await pool.end(); }
}

if (require.main === module) main(process.argv.slice(2)).catch(() => {
    console.error('Первый менеджер не создан. Проверьте параметры, целевую БД и отсутствие существующего менеджера.');
    process.exitCode = 1;
});

module.exports = { createManager };
