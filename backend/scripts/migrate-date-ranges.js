async function migrateDateRanges(pool, { apply = false, expectedDatabase } = {}) {
    if (!expectedDatabase) throw new Error('Explicit target database required');
    const client = await pool.connect();
    try {
        await client.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');
        await client.query("SET LOCAL lock_timeout='5s'");
        await client.query("SET LOCAL statement_timeout='30s'");
        if ((await client.query('SELECT current_database() AS name')).rows[0].name !== expectedDatabase) throw new Error('Target database mismatch');
        if (apply) await client.query('LOCK TABLE task_list, vacation IN SHARE ROW EXCLUSIVE MODE');
        const problems = (await client.query(`SELECT
            (SELECT count(*)::int FROM task_list WHERE start_date>end_date) AS task_ranges,
            (SELECT count(*)::int FROM vacation WHERE start_holiday>end_holiday) AS vacation_ranges`)).rows[0];
        if (problems.task_ranges || problems.vacation_ranges) {
            await client.query('ROLLBACK');
            return { mode: apply ? 'apply' : 'dry-run', status: 'blocked-by-data', problems };
        }
        const missing = [];
        for (const [table,name,definition] of [
            ['task_list','task_date_range','CHECK ((start_date <= end_date))'],
            ['vacation','vacation_date_range','CHECK ((start_holiday <= end_holiday))']
        ]) {
            const existing = await client.query(`SELECT pg_get_constraintdef(oid) AS definition, convalidated
                FROM pg_constraint WHERE conrelid=$1::regclass AND conname=$2`,['public.'+table,name]);
            if (existing.rowCount) {
                if (existing.rows[0].definition !== definition || !existing.rows[0].convalidated) throw new Error('Incompatible date constraint');
            } else {
                missing.push(name);
                if (apply) await client.query(`ALTER TABLE public.${table} ADD CONSTRAINT ${name} ${definition}`);
            }
        }
        await client.query('COMMIT');
        return { mode:apply?'apply':'dry-run', status:missing.length?(apply?'applied':'would-apply'):'already-present', missing };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
}

async function main(args) {
    if (args.length===1 && args[0]==='--help') {
        console.log('node scripts/migrate-date-ranges.js [--dry-run | --apply] --database=<name>');
        return;
    }
    const targets=args.filter(arg=>arg.startsWith('--database='));
    if (targets.length!==1 || !targets[0].slice(11) || new Set(args).size!==args.length ||
        args.some(arg=>!['--dry-run','--apply'].includes(arg)&&!arg.startsWith('--database=')) ||
        (args.includes('--apply')&&args.includes('--dry-run'))) throw new Error('Invalid arguments');
    const pool=require('./admin-pool')();
    try {
        const result=await migrateDateRanges(pool,{expectedDatabase:targets[0].slice(11),apply:args.includes('--apply')});
        console.log(JSON.stringify(result));
        if (result.status==='blocked-by-data') process.exitCode=1;
    } finally { await pool.end(); }
}
if (require.main===module) main(process.argv.slice(2)).catch(()=>{
    console.error('Миграция диапазонов дат не выполнена. Проверьте целевую БД, права и совместимость схемы.');
    process.exitCode=1;
});
module.exports={migrateDateRanges};
