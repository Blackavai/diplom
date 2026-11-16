// Только одноразовый proxy-проект и синтетическая PostgreSQL.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');

async function main() {
    assert.equal(process.env.RECOVERY_TEST_DATABASE,'1');
    assert.equal(process.env.NODE_ENV,'test');
    assert.equal(process.env.DB_HOST,'recovery-db');
    assert.equal(process.env.DB_NAME,'dailysync_recovery_test');
    assert.equal(process.env.DB_USER,'recovery_test');
    assert.ok(['--prepare','--replay'].includes(process.argv[2]) && process.argv.length===3);
    const pool=require('../db');
    const file='/tmp/stage13-idempotency-smoke.json';
    const password='synthetic-restart-password';
    try {
        assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name,'dailysync_recovery_test');
        let state;
        if (process.argv[2]==='--prepare') {
            const account='restart-smoke-'+randomUUID();
            const hash=await require('../utils/passwords').hashPassword(password);
            const user=(await pool.query(`INSERT INTO users(fname,lname,tg_id,post,role,password)
                VALUES ('Restart','Test',$1,'Test',1,$2) RETURNING id`,[account,hash])).rows[0];
            const task=(await pool.query(`INSERT INTO task_list(content,id_user,start_date,end_date,status)
                VALUES ('Restart smoke',$1,'2026-01-01','2099-01-01',false) RETURNING id`,[user.id])).rows[0];
            state={account,userId:user.id,taskId:task.id,teamKey:randomUUID(),reportKey:randomUUID()};
        } else state=JSON.parse(readFileSync(file,'utf8'));
        const origin=process.argv[2]==='--prepare'?'http://proxy-nginx':'http://proxy-vite:5173';
        const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-Auth-Mode':'bearer'},body:JSON.stringify({tg_id:state.account,password})});
        assert.equal(login.status,200);
        const token=(await login.json()).user.token;
        async function post(path,key,body) {
            const response=await fetch(origin+'/api'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'Idempotency-Key':key},body:JSON.stringify(body)});
            assert.equal(response.status,200);
            return response.json();
        }
        const team=await post('/teams/create',state.teamKey,{nameTeam:'Restart smoke team',usersId:[state.userId]});
        const report=await post('/reports/new',state.reportKey,{id_task:state.taskId,text_report:'Restart smoke report',end_date:'2026-11-16'});
        if (process.argv[2]==='--prepare') {
            state.team=team;
            state.report=report;
            writeFileSync(file,JSON.stringify(state),{mode:0o600});
            console.log('Prepared synthetic replay operations; restart only the test proxy-app, then run --replay');
        } else {
            assert.deepEqual(team,state.team);
            assert.deepEqual(report,state.report);
            assert.equal((await pool.query('SELECT count(*)::int AS n FROM report_list WHERE id_task=$1',[state.taskId])).rows[0].n,1);
            assert.equal((await pool.query('SELECT count(*)::int AS n FROM teams_name WHERE id=$1',[state.team.task.id])).rows[0].n,1);
            assert.equal((await pool.query('SELECT count(*)::int AS n FROM request_idempotency WHERE user_id=$1',[state.userId])).rows[0].n,2);
            console.log('PASS actual backend restart: PostgreSQL replays report/team results through the other proxy without duplicate records');
        }
    } finally { await pool.end(); }
}
main().catch(()=>{console.error('Synthetic restart smoke failed');process.exitCode=1;});
