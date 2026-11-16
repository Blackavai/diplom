const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {readFileSync}=require('node:fs');

test('stage 14 parts 1-2: preserved history and calendar dates',{
    skip:process.env.RECOVERY_TEST_DATABASE!=='1'
},async(t)=>{
    assert.equal(process.env.NODE_ENV,'test');
    assert.equal(process.env.DB_HOST,'recovery-db');
    assert.equal(process.env.DB_USER,'recovery_test');
    assert.equal(process.env.DB_NAME,'dailysync_recovery_test');
    const pool=require('../db');
    t.after(()=>pool.end());
    assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name,'dailysync_recovery_test');
    const express=require('express');
    const jwt=require('jsonwebtoken');
    const app=express();app.use(express.json());
    for(const [prefix,name] of [['auth','auth'],['users','user'],['tasks','task'],['reports','report']])app.use('/api/'+prefix,require('../routes/'+name+'Routes'));
    app.use('/api',require('../middleware/errorMiddleware').apiNotFound);
    app.use(require('../middleware/errorMiddleware').apiErrorHandler);
    const server=app.listen(0,'127.0.0.1');
    t.after(()=>new Promise(resolve=>server.close(resolve)));
    await once(server,'listening');
    const base=`http://127.0.0.1:${server.address().port}/api`;
    let sequence=0;
    async function user(role=2){return(await pool.query(`INSERT INTO users(fname,lname,tg_id,role,post)
        VALUES ('Stage14','Test',$1,$2,'Test') RETURNING id`,['stage14-'+(++sequence),role])).rows[0].id;}
    const manager=await user(1);const worker=await user();
    const token=id=>jwt.sign({id,sessionVersion:0},process.env.JWT_SECRET,{expiresIn:'1h'});
    async function request(method,path,body,actor=manager){
        const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(actor?{Authorization:'Bearer '+token(actor)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
        return{status:response.status,data:await response.json(),headers:response.headers};
    }
    async function task(owner=worker){return(await pool.query(`INSERT INTO task_list(content,id_user,start_date,end_date,status)
        VALUES ('Stage14',$1,'2026-11-16','2099-01-01',false) RETURNING id`,[owner])).rows[0].id;}
    async function snapshot(){
        const data={};
        for(const table of ['users','task_list','report_list','vacation','teams','teams_name'])data[table]=(await pool.query('SELECT * FROM '+table+' ORDER BY id')).rows;
        return data;
    }
    await t.test('old GET cannot delete, while both DELETE routes work for independent records',async()=>{
        const id=await user();const before=await snapshot();
        const old=await request('GET','/users/delete/'+id);
        assert.equal(old.status,405);assert.equal(old.headers.get('allow'),'DELETE');assert.deepEqual(await snapshot(),before);
        for(const prefix of ['/users/delete/','/auth/delUser/']){
            const target=await user();
            assert.equal((await request('DELETE',prefix+target,undefined,worker)).status,403);
            assert.equal((await request('DELETE',prefix+target,undefined,null)).status,401);
            assert.equal((await request('DELETE',prefix+target)).status,201);
            assert.equal((await request('DELETE',prefix+target)).status,404);
        }
    });
    await t.test('each employee dependency blocks both deletes and preserves all rows',async()=>{
        for(const dependency of ['task','report','vacation','team']){
            const id=await user();
            if(dependency==='task')await task(id);
            if(dependency==='report')await pool.query("INSERT INTO report_list(id_task,id_user,text_report,end_date,status_task) VALUES ($1,$2,'Historical author','2026-11-16',true)",[await task(manager),id]);
            if(dependency==='vacation')await pool.query("INSERT INTO vacation(id_user,start_holiday,end_holiday) VALUES ($1,'2099-01-01','2099-01-02')",[id]);
            if(dependency==='team'){
                const team=(await pool.query("INSERT INTO teams_name(name_team) VALUES ('Stage14') RETURNING id")).rows[0].id;
                await pool.query('INSERT INTO teams(id_team_name,id_user) VALUES ($1,$2)',[team,id]);
            }
            const before=await snapshot();
            for(const prefix of ['/users/delete/','/auth/delUser/'])assert.equal((await request('DELETE',prefix+id)).status,409,dependency);
            assert.deepEqual(await snapshot(),before);
        }
    });
    await t.test('task report history returns conflict; an independent task can be deleted',async()=>{
        const id=await task();
        await pool.query("INSERT INTO report_list(id_task,id_user,text_report,end_date,status_task) VALUES ($1,$2,'History','2026-11-16',true)",[id,worker]);
        const before=await snapshot();
        assert.equal((await request('DELETE','/tasks/delete/'+id)).status,409);
        assert.deepEqual(await snapshot(),before);
        const empty=await task();assert.equal((await request('DELETE','/tasks/delete/'+empty)).status,200);
    });
    await t.test('report versus task deletion is serialized without orphaned history',async()=>{
        const id=await task();
        const results=await Promise.all([
            request('POST','/reports/new',{id_task:id,text_report:'Concurrent',end_date:'2026-11-16'},worker),
            request('DELETE','/tasks/delete/'+id)
        ]);
        assert.ok((results[0].status===200&&results[1].status===409)||(results[0].status===404&&results[1].status===200));
        const count=(await pool.query('SELECT count(*)::int AS n FROM report_list WHERE id_task=$1',[id])).rows[0].n;
        assert.equal(count,results[0].status===200?1:0);
    });
    await t.test('reverse ranges fail on create/update/vacation and same-day ranges remain valid',async()=>{
        const before=await snapshot();
        assert.equal((await request('POST','/tasks/new',{content:'Reverse',id_user:worker,start_date:'2026-11-17',end_date:'2026-11-16'})).status,400);
        assert.equal((await request('POST','/users/vacation/'+worker,{startHoliday:'2026-11-17',endHoliday:'2026-11-16'})).status,400);
        assert.deepEqual(await snapshot(),before);
        const id=await task();
        assert.equal((await request('PUT','/tasks/update/'+id,{content:'Reverse update',date:'2026-11-15',status:false})).status,400);
        const same=await request('PUT','/tasks/update/'+id,{content:'Same day',end_date:'2026-11-16T23:00:00-05:00',status:false});
        assert.equal(same.status,200);assert.equal(same.data.end_date,'2026-11-16');assert.equal(same.data.start_date,'2026-11-16');
    });
    await t.test('DATE is returned as calendar text even under another process timezone',async()=>{
        const previous=process.env.TZ;process.env.TZ='America/Los_Angeles';
        try{
            const response=await request('POST','/tasks/new',{content:'Calendar',id_user:worker,start_date:'0001-01-01',end_date:'9999-12-31'});
            assert.equal(response.status,200);assert.equal(response.data.task.start_date,'0001-01-01');assert.equal(response.data.task.end_date,'9999-12-31');
            assert.equal((await pool.query('SELECT start_date FROM task_list WHERE id=$1',[response.data.task.id])).rows[0].start_date,'0001-01-01');
        }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
    });
    await t.test('all of the last Moscow vacation day is included by both APIs',async()=>{
        const id=await user();
        await pool.query("INSERT INTO vacation(id_user,start_holiday,end_holiday) VALUES ($1,'2026-11-16','2026-11-16')",[id]);
        const OriginalDate=Date;
        let instant='2026-11-16T20:59:59Z';
        global.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[instant]));}};
        try{
            const body={content:'Vacation day',id_user:id,start_date:'2099-01-01',end_date:'2099-01-02'};
            assert.equal((await request('POST','/tasks/new',body)).data.checkVacation,true);
            assert.equal((await request('GET','/users/'+id+'/vacation')).data.user.end_holiday,'2026-11-16');
            instant='2026-11-16T21:00:00Z';
            assert.equal((await request('POST','/tasks/new',body)).data.checkVacation,false);
            assert.equal((await request('GET','/users/'+id+'/vacation')).data.user,'Отсутствует');
        }finally{global.Date=OriginalDate;}
    });
    await t.test('date migration blocks invalid historical ranges and is repeatable after explicit correction',async()=>{
        const {Pool}=require('pg');const {migrateDateRanges}=require('../scripts/migrate-date-ranges');
        await pool.query('CREATE DATABASE stage14_ranges_test');
        const separate=new Pool({host:'recovery-db',database:'stage14_ranges_test',user:'recovery_test',password:'synthetic-test-only'});
        t.after(()=>separate.end());
        await separate.query(readFileSync(require.resolve('./fixtures/recovery-schema.sql'),'utf8'));
        const options={expectedDatabase:'stage14_ranges_test'};
        assert.equal((await migrateDateRanges(separate,options)).status,'would-apply');
        await assert.rejects(migrateDateRanges(separate,{expectedDatabase:'wrong',apply:true}));
        const id=(await separate.query("INSERT INTO users(fname,lname,tg_id,post,role) VALUES ('Range','Test','range','Test',2) RETURNING id")).rows[0].id;
        await separate.query("INSERT INTO task_list(content,id_user,start_date,end_date,status) VALUES ('Old',$1,'2026-11-17','2026-11-16',false)",[id]);
        const before=(await separate.query('SELECT * FROM task_list')).rows;
        const blocked=await migrateDateRanges(separate,{...options,apply:true});
        assert.equal(blocked.status,'blocked-by-data');assert.equal(blocked.problems.task_ranges,1);
        assert.deepEqual((await separate.query('SELECT * FROM task_list')).rows,before);
        // Корректируем только созданный тестовый fixture явно, миграция этого не делает.
        await separate.query("UPDATE task_list SET end_date='2026-11-18'");
        assert.equal((await migrateDateRanges(separate,{...options,apply:true})).status,'applied');
        assert.equal((await migrateDateRanges(separate,{...options,apply:true})).status,'already-present');
        await assert.rejects(separate.query("UPDATE task_list SET end_date='2026-11-01'"),error=>error.code==='23514');
        await assert.rejects(separate.query("INSERT INTO vacation(id_user,start_holiday,end_holiday) VALUES ($1,'2026-11-17','2026-11-16')",[id]),error=>error.code==='23514');
    });
});
