const IDEMPOTENCY_SQL = `CREATE TABLE public.request_idempotency (
    user_id integer NOT NULL,
    operation varchar(32) NOT NULL,
    request_key varchar(36) NOT NULL,
    request_hash varchar(64) NOT NULL,
    result jsonb,
    PRIMARY KEY (user_id, operation, request_key)
)`;

async function migrateIntegrity(pool, { apply = false, expectedDatabase } = {}) {
    if (!expectedDatabase) throw new Error('Explicit target database required');
    const client = await pool.connect();
    try {
        await client.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '30s'");
        const database = (await client.query('SELECT current_database() AS name')).rows[0].name;
        if (database !== expectedDatabase) throw new Error('Target database mismatch');
        if (apply) await client.query('LOCK TABLE users, teams, report_list IN SHARE ROW EXCLUSIVE MODE');
        const problems = (await client.query(`SELECT
            (SELECT count(*)::integer FROM (SELECT tg_id FROM users GROUP BY tg_id HAVING count(*)>1) duplicates) AS duplicate_accounts,
            (SELECT count(*)::integer FROM (SELECT id_team_name,id_user FROM teams GROUP BY id_team_name,id_user HAVING count(*)>1) duplicates) AS duplicate_memberships,
            (SELECT count(*)::integer FROM report_list r LEFT JOIN users u ON u.id=r.id_user WHERE u.id IS NULL) AS missing_authors`)).rows[0];
        if (Object.values(problems).some((count) => count > 0)) {
            await client.query('ROLLBACK');
            return { mode: apply ? 'apply' : 'dry-run', status: 'blocked-by-data', problems };
        }
        const constraints = [
            ['users_tg_id_unique', 'users', 'UNIQUE (tg_id)'],
            ['teams_membership_unique', 'teams', 'UNIQUE (id_team_name, id_user)'],
            ['report_author_fk', 'report_list', 'FOREIGN KEY (id_user) REFERENCES users(id)']
        ];
        const missing = [];
        for (const [name, table, definition] of constraints) {
            const existing = await client.query(`SELECT pg_get_constraintdef(oid) AS definition, convalidated
                FROM pg_constraint WHERE conrelid=$1::regclass AND conname=$2`, ['public.' + table, name]);
            if (existing.rowCount) {
                if (existing.rows[0].definition !== definition || !existing.rows[0].convalidated) {
                    throw new Error('Incompatible existing constraint');
                }
            } else {
                missing.push(name);
                if (apply) await client.query(`ALTER TABLE public.${table} ADD CONSTRAINT ${name} ${definition}`);
            }
        }
        const table = await client.query("SELECT to_regclass('public.request_idempotency') AS name");
        if (!table.rows[0].name) {
            missing.push('request_idempotency');
            if (apply) await client.query(IDEMPOTENCY_SQL);
        } else {
            const columns = (await client.query(`SELECT column_name, data_type, character_maximum_length, is_nullable
                FROM information_schema.columns WHERE table_schema='public' AND table_name='request_idempotency'
                ORDER BY ordinal_position`)).rows;
            const expected = [
                ['user_id','integer',null,'NO'], ['operation','character varying',32,'NO'],
                ['request_key','character varying',36,'NO'], ['request_hash','character varying',64,'NO'],
                ['result','jsonb',null,'YES']
            ];
            if (JSON.stringify(columns.map((column) => Object.values(column))) !== JSON.stringify(expected)) {
                throw new Error('Incompatible idempotency table');
            }
            const primary = await client.query(`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
                WHERE conrelid='public.request_idempotency'::regclass AND contype='p'`);
            if (primary.rows[0]?.definition !== 'PRIMARY KEY (user_id, operation, request_key)') throw new Error('Missing idempotency primary key');
        }
        await client.query('COMMIT');
        return { mode: apply ? 'apply' : 'dry-run', status: missing.length ? (apply ? 'applied' : 'would-apply') : 'already-present', missing };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally { client.release(); }
}

async function main(args) {
    if (args.length === 1 && args[0] === '--help') {
        console.log('node scripts/migrate-integrity.js [--dry-run | --apply] --database=<expected-database>');
        return;
    }
    const targets = args.filter((arg) => arg.startsWith('--database='));
    if (targets.length !== 1 || !targets[0].slice(11) || new Set(args).size !== args.length ||
        args.some((arg) => !['--apply','--dry-run'].includes(arg) && !arg.startsWith('--database=')) ||
        (args.includes('--apply') && args.includes('--dry-run'))) throw new Error('Invalid arguments');
    const pool = require('./admin-pool')();
    try {
        const result = await migrateIntegrity(pool, { apply: args.includes('--apply'), expectedDatabase: targets[0].slice(11) });
        console.log(JSON.stringify(result));
        if (result.status === 'blocked-by-data') process.exitCode = 1;
    } finally { await pool.end(); }
}

if (require.main === module) main(process.argv.slice(2)).catch(() => {
    console.error('Изменения целостности не выполнены. Проверьте целевую БД, права и совместимость схемы.');
    process.exitCode = 1;
});

module.exports = { migrateIntegrity, IDEMPOTENCY_SQL };
