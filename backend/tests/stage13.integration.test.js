const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');

test('stage 13 cookies, CSRF, CRUD, idempotency and safe provisioning', {
    skip: process.env.RECOVERY_TEST_DATABASE !== '1'
}, async (t) => {
    assert.equal(process.env.NODE_ENV, 'test');
    assert.equal(process.env.DB_HOST, 'recovery-db');
    assert.equal(process.env.DB_NAME, 'dailysync_recovery_test');
    assert.equal(process.env.DB_USER, 'recovery_test');
    const pool = require('../db');
    t.after(() => pool.end());
    assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name, 'dailysync_recovery_test');
    const { Pool } = require('pg');
    const express = require('express');
    const jwt = require('jsonwebtoken');
    const { hashPassword, verifyPassword } = require('../utils/passwords');
    const { loginAttempts, createLoginAttempts } = require('../utils/loginAttempts');
    const { migrateIntegrity } = require('../scripts/migrate-integrity');
    const { createManager } = require('../scripts/create-manager');
    const { setupRuntimeRole } = require('../scripts/setup-runtime-role');
    t.beforeEach(() => Object.assign(loginAttempts, createLoginAttempts()));
    const app = express();
    app.use(express.json());
    for (const name of ['auth','users','reports','teams','tasks']) {
        const file = { auth:'auth',users:'user',reports:'report',teams:'team',tasks:'task' }[name];
        app.use('/api/' + name, require('../routes/' + file + 'Routes'));
    }
    app.use('/api', require('../middleware/errorMiddleware').apiNotFound);
    app.use(require('../middleware/errorMiddleware').apiErrorHandler);
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(method, path, body, headers = {}) {
        const response = await fetch(base + '/api' + path, { method,
            headers: { 'Content-Type':'application/json', ...headers },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        const text = await response.text();
        return { status:response.status, headers:response.headers, data:text ? JSON.parse(text) : null };
    }
    async function actor(account, role) {
        return (await pool.query(`INSERT INTO users(fname,lname,tg_id,post,role,password)
            VALUES ('Stage13','Test',$1,'Test',$2,$3) RETURNING id,tg_id`, [account,role,await hashPassword('stage13-password')])).rows[0];
    }
    const manager = await actor('stage13-manager',1);
    const worker = await actor('stage13-worker',2);
    const bearer = (user) => ({ Authorization:'Bearer ' + jwt.sign({ id:user.id,sessionVersion:0 },process.env.JWT_SECRET,{ expiresIn:'1h' }) });
    const managerHeaders = bearer(manager);
    const workerHeaders = bearer(worker);
    async function login(user = manager) {
        const response = await request('POST','/auth/login',{ tg_id:user.tg_id,password:'stage13-password' },{ 'X-Requested-With':'XMLHttpRequest' });
        assert.equal(response.status,200);
        assert.equal(response.data.user.token,undefined);
        const cookie = response.headers.getSetCookie().find((value) => value.startsWith('dailysync_session='));
        assert.ok(cookie);
        const headers = { Cookie:cookie.split(';')[0] };
        const proof = await request('GET','/auth/protected',undefined,headers);
        assert.equal(proof.status,200);
        return { cookie, headers:{ ...headers,'X-Session-Id':proof.data.sessionId,'X-CSRF-Token':proof.data.csrfToken }, proof:proof.data };
    }
    async function task(owner = worker.id) {
        return (await pool.query(`INSERT INTO task_list(content,id_user,start_date,end_date,status)
            VALUES ('Stage13 task',$1,'2026-01-01','2099-01-01',false) RETURNING id`,[owner])).rows[0].id;
    }
    const reportBody = (id) => ({ id_task:id,text_report:'Stage13 report',end_date:'2026-11-16' });

    await t.test('browser login needs a custom header; browser cannot request a JSON Bearer', async () => {
        const body = { tg_id:manager.tg_id,password:'stage13-password' };
        for (const headers of [{},{'X-Auth-Mode':'bearer',Origin:'https://foreign.example'},
            {'X-Requested-With':'XMLHttpRequest','Sec-Fetch-Site':'cross-site'},
            {'X-Auth-Mode':'bearer','Sec-Fetch-Site':'same-origin'}]) {
            const response = await request('POST','/auth/login',body,headers);
            assert.equal(response.status,403);
            assert.equal(response.headers.get('set-cookie'),null);
            assert.equal(response.data.user,undefined);
        }
    });
    await t.test('cookie is HttpOnly, scoped and Lax; protected returns a safe proof without the JWT', async () => {
        const session = await login();
        assert.match(session.cookie,/HttpOnly/);
        assert.match(session.cookie,/SameSite=Lax/);
        assert.match(session.cookie,/Path=\/api/);
        assert.doesNotMatch(session.cookie,/; Secure/);
        assert.match(session.proof.sessionId,/^[a-f0-9]{32}$/);
        assert.match(session.proof.csrfToken,/^[a-f0-9]{64}$/);
        assert.deepEqual(Object.keys(session.proof.user).sort(),['fname','id','lname','post','role','tg_id']);
        assert.equal(session.proof.user.id,manager.id);
        assert.equal((await request('GET','/users',undefined,session.headers)).status,200);
        assert.equal((await request('GET','/users',undefined,{ Cookie:'token=legacy-copy' })).status,401);
        assert.equal((await request('GET','/users',undefined,{ Cookie:session.headers.Cookie+'; '+session.headers.Cookie })).status,401);
    });
    await t.test('Secure is explicitly enabled for HTTPS without trusting forwarded headers', async () => {
        process.env.SESSION_COOKIE_SECURE='true';
        try { assert.match((await login()).cookie,/; Secure/); }
        finally { delete process.env.SESSION_COOKIE_SECURE; }
    });
    await t.test('missing, wrong and cross-site CSRF cannot create or delete through the old GET', async () => {
        const session = await login();
        const before = (await pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n;
        for (const headers of [{ Cookie:session.headers.Cookie },
            {...session.headers,'X-CSRF-Token':'0'.repeat(64)},
            {...session.headers,'Sec-Fetch-Site':'cross-site'}]) {
            assert.equal((await request('POST','/auth/createUser',{},headers)).status,403);
            assert.equal((await request('GET','/users/delete/'+worker.id,undefined,headers)).status,403);
            assert.equal((await request('POST','/auth/logout',{},headers)).status,403);
        }
        assert.equal((await request('GET','/users',undefined,{ ...session.headers,'X-Session-Id':'0'.repeat(32) })).status,401);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n,before);
    });
    await t.test('old CSRF and session ID cannot operate on a newer login', async () => {
        const old = await login();
        const fresh = await login();
        const mixed = { ...old.headers,Cookie:fresh.headers.Cookie };
        assert.equal((await request('POST','/auth/logout',{},mixed)).status,401);
        assert.equal((await request('GET','/auth/protected',undefined,fresh.headers)).status,200);
    });
    await t.test('explicit non-browser Bearer login remains available and sets no cookie', async () => {
        const response = await request('POST','/auth/login',{ tg_id:manager.tg_id,password:'stage13-password' },{'X-Auth-Mode':'bearer'});
        assert.equal(response.status,200);
        assert.equal(response.headers.get('set-cookie'),null);
        assert.ok(response.data.user.token);
        assert.equal((await request('GET','/users',undefined,{Authorization:'Bearer '+response.data.user.token})).status,200);
    });
    await t.test('cookie roles are checked in PostgreSQL and forged fields do not grant rights', async () => {
        const session = await login(worker);
        assert.equal((await request('POST','/auth/createUser',{role:1},session.headers)).status,403);
    });
    await t.test('vacation validates IDs and actual dates, returns stored values and missing employee 404', async () => {
        for (const id of ['0','-1','01','bad','2147483648']) {
            assert.equal((await request('POST','/users/vacation/'+id,{startHoliday:'2026-01-01',endHoliday:'2026-02-01'},managerHeaders)).status,400);
        }
        for (const body of [{},undefined,{startHoliday:'2026-02-30',endHoliday:'2026-03-01'},{startHoliday:[],endHoliday:42}]) {
            assert.equal((await request('POST','/users/vacation/'+worker.id,body,managerHeaders)).status,400);
        }
        assert.equal((await request('POST','/users/vacation/2147483647',{startHoliday:'2026-01-01',endHoliday:'2026-02-01'},managerHeaders)).status,404);
        const created = await request('POST','/users/vacation/'+worker.id,{startHoliday:'2098-02-01T03:00:00Z',endHoliday:'2098-03-01'},managerHeaders);
        assert.equal(created.status,201);
        assert.ok(created.data.user.id);
        assert.equal(Number(created.data.user.id_user),worker.id);
        // Порядок дат остаётся отдельным правилом этапа 14.
        assert.equal(created.data.user.start_holiday.slice(0,10),'2098-02-01');
    });
    await t.test('both employee deletion routes distinguish invalid, missing and deleted rows', async () => {
        for (const [method,prefix] of [['DELETE','/users/delete/'],['DELETE','/auth/delUser/']]) {
            assert.equal((await request(method,prefix+'bad',undefined,managerHeaders)).status,400);
            assert.equal((await request(method,prefix+'2147483647',undefined,managerHeaders)).status,404);
            const user = await actor('stage13-delete-'+method,2);
            assert.equal((await request(method,prefix+user.id,undefined,managerHeaders)).status,201);
            assert.equal((await request(method,prefix+user.id,undefined,managerHeaders)).status,404);
        }
    });
    await t.test('a real zero-row vacation INSERT cannot report successful creation', async () => {
        await pool.query(`CREATE FUNCTION stage13_skip_vacation() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN IF NEW.id_user=${worker.id} THEN RETURN NULL; END IF; RETURN NEW; END $$`);
        await pool.query('CREATE TRIGGER stage13_skip_vacation BEFORE INSERT ON vacation FOR EACH ROW EXECUTE FUNCTION stage13_skip_vacation()');
        try {
            const response=await request('POST','/users/vacation/'+worker.id,{startHoliday:'2098-03-01',endHoliday:'2098-03-02'},managerHeaders);
            assert.equal(response.status,500);
            assert.deepEqual(response.data,{message:'Ошибка сервера'});
        } finally {
            await pool.query('DROP TRIGGER stage13_skip_vacation ON vacation');
            await pool.query('DROP FUNCTION stage13_skip_vacation()');
        }
    });
    await t.test('report acceptance validates ID, missing row and permits a repeated acceptance', async () => {
        assert.equal((await request('PUT','/reports/accept/bad',{},managerHeaders)).status,400);
        assert.equal((await request('PUT','/reports/accept/2147483647',{},managerHeaders)).status,404);
        const id = await task();
        assert.equal((await request('POST','/reports/new',reportBody(id),workerHeaders)).status,200);
        const report = (await pool.query('SELECT id FROM report_list WHERE id_task=$1',[id])).rows[0];
        for (let attempt=0;attempt<2;attempt++) {
            const accepted = await request('PUT','/reports/accept/'+report.id,{},managerHeaders);
            assert.equal(accepted.status,200);
            assert.equal(accepted.data.check_report,true);
        }
    });
    await t.test('team text rejects NUL and lone surrogates before SQL', async () => {
        for (const text of ['bad\0name','\ud800','\udfff']) {
            assert.equal((await request('POST','/teams/create',{nameTeam:text},managerHeaders)).status,400);
            assert.equal((await request('POST','/teams/create',{nameTeam:'Valid',descriptionTeam:text},managerHeaders)).status,400);
        }
    });
    await t.test('browser report and team creation require a valid idempotency key', async () => {
        const session = await login();
        const id = await task(manager.id);
        for (const extra of [{},{'Idempotency-Key':'bad'}]) {
            const headers = {...session.headers,...extra};
            assert.equal((await request('POST','/reports/new',reportBody(id),headers)).status,400);
            assert.equal((await request('POST','/teams/create',{nameTeam:'Missing key'},headers)).status,400);
        }
    });
    await t.test('parallel same-key reports return success twice but create a single report', async () => {
        const id = await task();
        const headers = {...workerHeaders,'Idempotency-Key':randomUUID()};
        const results = await Promise.all([request('POST','/reports/new',reportBody(id),headers),request('POST','/reports/new',reportBody(id),headers)]);
        assert.deepEqual(results.map((result)=>result.status),[200,200]);
        assert.deepEqual(results[0].data,results[1].data);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM report_list WHERE id_task=$1',[id])).rows[0].n,1);
        assert.equal((await request('POST','/reports/new',{...reportBody(id),text_report:'Different'},headers)).status,409);
        assert.equal((await request('POST','/reports/new',reportBody(id),{...workerHeaders,'Idempotency-Key':randomUUID()})).status,409);
        assert.equal((await request('POST','/reports/new',reportBody(id),{...managerHeaders,'Idempotency-Key':headers['Idempotency-Key']})).status,404);
    });
    await t.test('reopening permits a new report; replaying the previous operation cannot complete it', async () => {
        const id = await task();
        const headers = {...workerHeaders,'Idempotency-Key':randomUUID()};
        assert.equal((await request('POST','/reports/new',reportBody(id),headers)).status,200);
        assert.equal((await request('PUT','/tasks/update/'+id,{content:'Reopened',end_date:'2099-01-01',status:false},managerHeaders)).status,200);
        assert.equal((await request('POST','/reports/new',reportBody(id),headers)).status,200);
        assert.equal((await pool.query('SELECT status FROM task_list WHERE id=$1',[id])).rows[0].status,false);
        assert.equal((await request('POST','/reports/new',reportBody(id),{...workerHeaders,'Idempotency-Key':randomUUID()})).status,200);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM report_list WHERE id_task=$1',[id])).rows[0].n,2);
    });
    await t.test('parallel team replays preserve one team and one membership per member', async () => {
        const key = randomUUID();
        const headers = {...managerHeaders,'Idempotency-Key':key};
        const body = {nameTeam:'Stage13 idempotent team',usersId:[manager.id,worker.id]};
        const results = await Promise.all([request('POST','/teams/create',body,headers),request('POST','/teams/create',{...body,usersId:[worker.id,manager.id]},headers)]);
        assert.deepEqual(results.map((result)=>result.status),[200,200]);
        assert.deepEqual(results[0].data,results[1].data);
        const id = results[0].data.task.id;
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM teams WHERE id_team_name=$1',[id])).rows[0].n,2);
        assert.equal((await request('POST','/teams/create',{...body,nameTeam:'Changed'},headers)).status,409);
    });
    await t.test('failed report transaction rolls back its idempotency record and can safely retry', async () => {
        const id = await task();
        const key = randomUUID();
        const headers = {...workerHeaders,'Idempotency-Key':key};
        await pool.query(`CREATE FUNCTION stage13_fail_completion() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN IF NEW.id=${id} THEN RAISE EXCEPTION 'synthetic-private-data'; END IF; RETURN NEW; END $$`);
        await pool.query('CREATE TRIGGER stage13_fail_completion BEFORE UPDATE ON task_list FOR EACH ROW EXECUTE FUNCTION stage13_fail_completion()');
        try {
            assert.equal((await request('POST','/reports/new',reportBody(id),headers)).status,500);
            assert.equal((await pool.query('SELECT count(*)::int AS n FROM request_idempotency WHERE request_key=$1',[key])).rows[0].n,0);
            assert.equal((await pool.query('SELECT count(*)::int AS n FROM report_list WHERE id_task=$1',[id])).rows[0].n,0);
        } finally {
            await pool.query('DROP TRIGGER stage13_fail_completion ON task_list');
            await pool.query('DROP FUNCTION stage13_fail_completion()');
        }
        assert.equal((await request('POST','/reports/new',reportBody(id),headers)).status,200);
    });
    await t.test('cookie logout revokes access without a late Set-Cookie overwriting a new login', async () => {
        const session = await login();
        const response = await request('POST','/auth/logout',{},session.headers);
        assert.equal(response.status,200);
        assert.equal(response.headers.get('set-cookie'),null);
        assert.equal((await request('GET','/auth/protected',undefined,session.headers)).status,401);
        const fresh = await login();
        assert.equal((await request('POST','/auth/logout',{},session.headers)).status,401);
        assert.equal((await request('GET','/auth/protected',undefined,fresh.headers)).status,200);
    });

    // Все дополнительные БД создаются только на проверенном одноразовом recovery-db.
    async function database(name, sql) {
        assert.match(name,/^stage13_[a-z_]+_test$/);
        await pool.query('CREATE DATABASE '+name);
        const separate = new Pool({host:'recovery-db',user:'recovery_test',password:'synthetic-test-only',database:name});
        t.after(()=>separate.end());
        await separate.query(sql);
        return separate;
    }
    const schema = readFileSync(require.resolve('./fixtures/recovery-schema.sql'),'utf8');
    const clean = await database('stage13_clean_test',schema);
    const dirty = await database('stage13_dirty_test',schema);
    await t.test('migration defaults to dry-run, verifies its target and is repeatable without data changes', async () => {
        assert.equal((await migrateIntegrity(clean,{expectedDatabase:'stage13_clean_test'})).status,'would-apply');
        await assert.rejects(migrateIntegrity(clean,{expectedDatabase:'wrong'}));
        assert.equal((await migrateIntegrity(clean,{expectedDatabase:'stage13_clean_test',apply:true})).status,'applied');
        assert.equal((await migrateIntegrity(clean,{expectedDatabase:'stage13_clean_test',apply:true})).status,'already-present');
        assert.equal((await clean.query('SELECT count(*)::int AS n FROM users')).rows[0].n,0);
    });
    await t.test('duplicates and orphan authors block apply without deleting or correcting any row', async () => {
        const user = (await dirty.query(`INSERT INTO users(fname,lname,tg_id,post,role)
            VALUES ('Dirty','Test','duplicate','Test',2),('Dirty','Test','duplicate','Test',2) RETURNING id`)).rows[0].id;
        const team = (await dirty.query("INSERT INTO teams_name(name_team) VALUES ('Dirty') RETURNING id")).rows[0].id;
        await dirty.query('INSERT INTO teams(id_team_name,id_user) VALUES ($1,$2),($1,$2)',[team,user]);
        const id = (await dirty.query("INSERT INTO task_list(content,id_user,start_date,end_date,status) VALUES ('Dirty',$1,'2026-01-01','2026-02-01',false) RETURNING id",[user])).rows[0].id;
        await dirty.query("INSERT INTO report_list(id_task,id_user,text_report,end_date,status_task) VALUES ($1,2147483647,'Dirty','2026-01-01',true)",[id]);
        const before = (await dirty.query('SELECT row_to_json(u) AS row FROM users u ORDER BY id')).rows;
        const result = await migrateIntegrity(dirty,{expectedDatabase:'stage13_dirty_test',apply:true});
        assert.equal(result.status,'blocked-by-data');
        assert.deepEqual(result.problems,{duplicate_accounts:1,duplicate_memberships:1,missing_authors:1});
        assert.deepEqual((await dirty.query('SELECT row_to_json(u) AS row FROM users u ORDER BY id')).rows,before);
        assert.equal((await dirty.query("SELECT count(*)::int AS n FROM pg_constraint WHERE conname='users_tg_id_unique'")).rows[0].n,0);
    });
    await t.test('safe bootstrap contains no copied credentials and creates no users; manager creation is explicit', async () => {
        const sql = readFileSync('/test-bootstrap.sql','utf8');
        assert.doesNotMatch(sql,/^COPY |INSERT INTO (?:public\.)?users/im);
        const bootstrap = await database('stage13_bootstrap_test',sql);
        assert.equal((await bootstrap.query('SELECT count(*)::int AS n FROM users')).rows[0].n,0);
        assert.equal((await migrateIntegrity(bootstrap,{expectedDatabase:'stage13_bootstrap_test'})).status,'already-present');
        const options = {expectedDatabase:'stage13_bootstrap_test',account:'new-manager',firstName:'New',lastName:'Manager',position:'Test',password:'selected-secret'};
        assert.equal((await createManager(bootstrap,options)).status,'would-create');
        assert.equal((await bootstrap.query('SELECT count(*)::int AS n FROM users')).rows[0].n,0);
        assert.equal((await createManager(bootstrap,{...options,apply:true})).status,'created');
        const row = (await bootstrap.query('SELECT password,role FROM users')).rows[0];
        assert.equal(row.role,1);
        assert.equal((await verifyPassword('selected-secret',row.password)).matches,true);
        assert.notEqual(row.password,'selected-secret');
        await assert.rejects(createManager(bootstrap,{...options,apply:true}));
    });
    await t.test('runtime role can perform application SQL but cannot manage schema, roles or unrelated tables', async (subtest) => {
        const options = {expectedDatabase:'stage13_clean_test',role:'stage13_runtime_test',password:'synthetic-role-password'};
        assert.equal((await setupRuntimeRole(clean,options)).status,'would-create');
        assert.equal((await setupRuntimeRole(clean,{...options,apply:true})).status,'configured');
        assert.equal((await setupRuntimeRole(clean,{...options,apply:true})).status,'configured');
        const runtime = new Pool({host:'recovery-db',user:options.role,password:options.password,database:options.expectedDatabase});
        t.after(()=>runtime.end());
        const user = (await runtime.query(`INSERT INTO users(fname,lname,tg_id,post,role) VALUES ('Runtime','Test','runtime','Test',1) RETURNING id`)).rows[0].id;
        assert.equal((await runtime.query('SELECT * FROM role')).rowCount,2);
        await runtime.query("UPDATE users SET post='Updated' WHERE id=$1",[user]);
        await clean.query('CREATE TABLE private_runtime_test(secret text)');
        for (const sql of ['CREATE TABLE denied(id integer)','ALTER TABLE users ADD COLUMN denied text',
            'DROP TABLE users','CREATE ROLE denied_role','SELECT * FROM private_runtime_test']) {
            await assert.rejects(runtime.query(sql),(error)=>error.code==='42501');
        }
        await runtime.query('DELETE FROM users WHERE id=$1',[user]);
        // Настоящие модели/маршруты временно используют отдельный ограниченный pool.
        subtest.mock.method(pool,'query',(...args)=>runtime.query(...args));
        subtest.mock.method(pool,'connect',(...args)=>runtime.connect(...args));
        const runtimeManager = await actor('runtime-api-manager',1);
        const runtimeHeaders = bearer(runtimeManager);
        const employee = await request('POST','/auth/createUser',{fname:'API',lname:'Runtime',tg_id:'runtime-api-worker',post:'Test',role:2,pass:'stage13-password'},runtimeHeaders);
        assert.equal(employee.status,201);
        const runtimeWorker = employee.data.user;
        const duplicateBody={fname:'Race',lname:'Runtime',tg_id:'runtime-concurrent-account',post:'Test',role:2,pass:'stage13-password'};
        const parallel=await Promise.all([request('POST','/auth/createUser',duplicateBody,runtimeHeaders),request('POST','/auth/createUser',duplicateBody,runtimeHeaders)]);
        assert.deepEqual(parallel.map(result=>result.status).sort(),[201,409]);
        assert.equal((await request('POST','/users/update/'+runtimeWorker.id,{fname:'API',lname:'Changed',post:'Test'},runtimeHeaders)).status,201);
        const assigned = await request('POST','/tasks/new',{content:'Runtime API task',id_user:runtimeWorker.id,start_date:'2026-01-01',end_date:'2099-01-01'},runtimeHeaders);
        assert.equal(assigned.status,200);
        const report = await request('POST','/reports/new',reportBody(assigned.data.task.id),{...bearer(runtimeWorker),'Idempotency-Key':randomUUID()});
        assert.equal(report.status,200);
        const reportId = (await clean.query('SELECT id FROM report_list WHERE id_task=$1',[assigned.data.task.id])).rows[0].id;
        assert.equal((await request('PUT','/reports/accept/'+reportId,{},runtimeHeaders)).status,200);
        assert.equal((await request('POST','/users/vacation/'+runtimeWorker.id,{startHoliday:'2098-01-01',endHoliday:'2098-01-02'},runtimeHeaders)).status,201);
        const team = await request('POST','/teams/create',{nameTeam:'Runtime API team',usersId:[runtimeWorker.id]},
            {...runtimeHeaders,'Idempotency-Key':randomUUID()});
        assert.equal(team.status,200);
        assert.equal((await request('DELETE','/teams/delete/'+team.data.task.id,undefined,runtimeHeaders)).status,200);
        const session = await login(runtimeManager);
        assert.equal((await request('POST','/auth/logout',{},session.headers)).status,200);
        await assert.rejects(setupRuntimeRole(clean,{...options,role:'recovery_test',apply:true}));
    });
    await t.test('new database constraints reject duplicates and unknown report authors', async () => {
        const user = (await clean.query("INSERT INTO users(fname,lname,tg_id,post,role) VALUES ('Unique','Test','unique','Test',2) RETURNING id")).rows[0].id;
        await assert.rejects(clean.query("INSERT INTO users(fname,lname,tg_id,post,role) VALUES ('Unique','Test','unique','Test',2)"),(error)=>error.code==='23505');
        const team = (await clean.query("INSERT INTO teams_name(name_team) VALUES ('Unique') RETURNING id")).rows[0].id;
        await clean.query('INSERT INTO teams(id_team_name,id_user) VALUES ($1,$2)',[team,user]);
        await assert.rejects(clean.query('INSERT INTO teams(id_team_name,id_user) VALUES ($1,$2)',[team,user]),(error)=>error.code==='23505');
        const id = (await clean.query("INSERT INTO task_list(content,id_user,start_date,end_date,status) VALUES ('Unique',$1,'2026-01-01','2026-02-01',false) RETURNING id",[user])).rows[0].id;
        await assert.rejects(clean.query("INSERT INTO report_list(id_task,id_user,text_report,end_date,status_task) VALUES ($1,2147483647,'Unknown','2026-01-01',true)",[id]),(error)=>error.code==='23503');
    });
    await t.test('an incompatible idempotency table rolls back all newly added constraints', async () => {
        const incompatible=await database('stage13_incompatible_test',schema);
        await incompatible.query('ALTER TABLE request_idempotency ADD COLUMN incompatible text');
        await assert.rejects(migrateIntegrity(incompatible,{expectedDatabase:'stage13_incompatible_test',apply:true}));
        assert.equal((await incompatible.query("SELECT count(*)::int AS n FROM pg_constraint WHERE conname='users_tg_id_unique'")).rows[0].n,0);
    });
});
