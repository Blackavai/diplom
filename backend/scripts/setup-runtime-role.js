const { escapeIdentifier, escapeLiteral } = require('pg');

const TABLES = ['users', 'teams_name', 'teams', 'task_list', 'report_list', 'vacation', 'request_idempotency'];

async function setupRuntimeRole(pool, { expectedDatabase, role, password, apply = false }) {
    if (!expectedDatabase || typeof role !== 'string' || !/^[a-z_][a-z0-9_]{0,62}$/.test(role) ||
        role.startsWith('pg_')) throw new Error('Invalid role parameters');
    const client = await pool.connect();
    try {
        await client.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');
        await client.query("SET LOCAL lock_timeout='5s'");
        if ((await client.query('SELECT current_database() AS name')).rows[0].name !== expectedDatabase) throw new Error('Target database mismatch');
        // Сериализуем только запуски этого скрипта. Административную роль не изменяем.
        if (apply) await client.query("SELECT pg_advisory_xact_lock(hashtext('dailysync-runtime-role'))");
        const connectionPrivileges = (await client.query(`SELECT rolsuper AS superuser, rolcreatedb AS create_database,
            rolcreaterole AS create_role FROM pg_roles WHERE rolname=current_user`)).rows[0];
        const existing = (await client.query(`SELECT oid, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
            FROM pg_roles WHERE rolname=$1`, [role])).rows[0];
        if (existing) {
            const memberships = await client.query('SELECT 1 FROM pg_auth_members WHERE member=$1 LIMIT 1', [existing.oid]);
            const ownsObjects = await client.query(`SELECT 1 FROM pg_class WHERE relowner=$1 UNION ALL
                SELECT 1 FROM pg_namespace WHERE nspowner=$1 LIMIT 1`, [existing.oid]);
            if (!existing.rolcanlogin || existing.rolsuper || existing.rolcreatedb || existing.rolcreaterole || existing.rolreplication ||
                existing.rolbypassrls || memberships.rowCount || ownsObjects.rowCount) throw new Error('Existing role has excess privileges or ownership');
        }
        const quotedRole = escapeIdentifier(role);
        if (apply) {
            if (!existing) {
                if (typeof password !== 'string' || password.length < 16) throw new Error('A new role requires a separate password');
                await client.query(`CREATE ROLE ${quotedRole} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${escapeLiteral(password)}`);
            }
            // Пароль существующей роли не меняем этим скриптом.
            await client.query(`GRANT CONNECT ON DATABASE ${escapeIdentifier(expectedDatabase)} TO ${quotedRole}`);
            await client.query(`GRANT USAGE ON SCHEMA public TO ${quotedRole}`);
            await client.query(`GRANT SELECT ON TABLE public.role TO ${quotedRole}`);
            for (const table of TABLES) {
                await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${table} TO ${quotedRole}`);
                const sequences = await client.query(`SELECT pg_get_serial_sequence($1, 'id') AS name
                    WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$2 AND column_name='id')`,
                ['public.' + table, table]);
                if (sequences.rows[0]?.name) await client.query(`GRANT USAGE, SELECT ON SEQUENCE ${sequences.rows[0].name.split('.').map(escapeIdentifier).join('.')} TO ${quotedRole}`);
            }
            const excess = (await client.query(`SELECT has_schema_privilege($1,'public','CREATE') AS schema_create,
                has_database_privilege($1,current_database(),'CREATE') AS database_create`, [role])).rows[0];
            if (excess.schema_create || excess.database_create) throw new Error('Effective CREATE privileges are too broad');
            const unrelated = await client.query(`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE c.relkind IN ('r','p','v','m','f') AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
                AND (n.nspname<>'public' OR c.relname<>ALL($2::text[]))
                AND has_table_privilege($1,c.oid,'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') LIMIT 1`,
            [role,[...TABLES,'role']]);
            const extra = await client.query(`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='public' AND c.relname=ANY($2::text[]) AND
                (has_table_privilege($1,c.oid,'TRUNCATE, REFERENCES, TRIGGER') OR
                 has_table_privilege($1,c.oid,'SELECT WITH GRANT OPTION, INSERT WITH GRANT OPTION, UPDATE WITH GRANT OPTION, DELETE WITH GRANT OPTION')) LIMIT 1`,
            [role,[...TABLES,'role']]);
            const roleWrites = await client.query("SELECT has_table_privilege($1,'public.role','INSERT, UPDATE, DELETE') AS allowed",[role]);
            if (unrelated.rowCount || extra.rowCount || roleWrites.rows[0].allowed) throw new Error('Existing table grants are too broad');
        }
        await client.query('COMMIT');
        return { mode: apply ? 'apply' : 'dry-run', status: apply ? 'configured' : (existing ? 'would-check-grants' : 'would-create'), connectionPrivileges };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
}

async function main(args) {
    if (args.length === 1 && args[0] === '--help') {
        console.log('node scripts/setup-runtime-role.js [--dry-run | --apply] --database=<name> --role=<runtime-role>');
        return;
    }
    const database = args.filter((arg) => arg.startsWith('--database='));
    const roles = args.filter((arg) => arg.startsWith('--role='));
    if (database.length !== 1 || roles.length !== 1 || new Set(args).size !== args.length ||
        args.some((arg) => !['--apply','--dry-run'].includes(arg) && !arg.startsWith('--database=') && !arg.startsWith('--role=')) ||
        (args.includes('--apply') && args.includes('--dry-run'))) throw new Error('Invalid arguments');
    const apply = args.includes('--apply');
    const pool = require('./admin-pool')();
    const options = { expectedDatabase: database[0].slice(11), role: roles[0].slice(7), apply };
    try {
        const check = await setupRuntimeRole(pool, { ...options, apply: false });
        if (apply && check.status === 'would-create') {
            const readPassword = require('./read-password');
            options.password = await readPassword('Пароль новой runtime-роли (от 16 символов): ');
            if (options.password !== await readPassword('Повторите пароль: ')) throw new Error('Passwords differ');
        }
        console.log(JSON.stringify(apply ? await setupRuntimeRole(pool, options) : check));
    }
    finally { await pool.end(); }
}

if (require.main === module) main(process.argv.slice(2)).catch(() => {
    console.error('Runtime-роль не настроена. Проверьте параметры, права, схему и отсутствие избыточных полномочий.');
    process.exitCode = 1;
});

module.exports = { setupRuntimeRole };
