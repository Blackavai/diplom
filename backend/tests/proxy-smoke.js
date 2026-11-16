// Explicit opt-in, synthetic PostgreSQL only. Run inside the isolated proxy-app container.
const assert = require('node:assert/strict');

async function main() {
    assert.equal(process.env.RECOVERY_TEST_DATABASE, '1');
    assert.equal(process.env.NODE_ENV, 'test');
    assert.equal(process.env.DB_HOST, 'recovery-db');
    assert.equal(process.env.DB_NAME, 'dailysync_recovery_test');
    assert.equal(process.env.DB_USER, 'recovery_test');
    assert.ok(process.argv.slice(2).every((argument) => argument === '--seed-browser'));
    const pool = require('../db');
    try {
        assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name, 'dailysync_recovery_test');
        const { hashPassword } = require('../utils/passwords');
        const password = 'synthetic-proxy-password';
        const hash = await hashPassword(password);
        if (process.argv.includes('--seed-browser')) {
            await pool.query(`INSERT INTO users(fname,lname,tg_id,role,post,password)
                SELECT 'Browser','Manager','browser-proxy-manager',1,'Test',$1
                WHERE NOT EXISTS (SELECT 1 FROM users WHERE tg_id='browser-proxy-manager')`, [hash]);
            await pool.query(`INSERT INTO task_list(content,id_user,start_date,end_date,status)
                SELECT 'Browser proxy report task',id,'2026-01-01','2099-01-01',false FROM users
                WHERE tg_id='browser-proxy-manager' AND NOT EXISTS (
                    SELECT 1 FROM task_list WHERE id_user=users.id AND content='Browser proxy report task' AND status=false
                )`);
            for (const label of ['nginx', 'vite']) {
                await pool.query(`INSERT INTO users(fname,lname,tg_id,role,post,password,password_change_recommended)
                    SELECT $1::varchar(255),'Test',$2::varchar(255),2,'Test',$3::text,true
                    WHERE NOT EXISTS (SELECT 1 FROM users WHERE tg_id=$2)`,
                ['Browser password ' + label, 'browser-password-worker-' + label, hash]);
            }
            console.log('Synthetic browser fixture ready');
            return;
        }
        const login = `proxy-smoke-${Date.now()}`;
        const actor = (await pool.query(`INSERT INTO users(fname,lname,tg_id,role,post,password,question,answer)
            VALUES ('Proxy','Smoke',$1,1,'Test',$2,'Synthetic question','synthetic-answer') RETURNING id`, [login, hash])).rows[0];
        for (const origin of ['http://proxy-nginx', 'http://proxy-vite:5173']) {
            const label = new URL(origin).hostname;
            const request = async (path, method = 'GET', body, token) => fetch(origin + path, {
                method, headers: { Host: 'localhost', 'Content-Type': 'application/json', 'X-Auth-Mode': 'bearer', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                ...(body === undefined ? {} : { body: JSON.stringify(body) })
            });
            const index = await (await request('/')).text();
            assert.match(index, /<div id="root">/);
            assert.equal(await (await request('/teams')).text(), index);
            assert.equal((await request('/api/teams')).status, 401);
            const unauthorized = await request('/api/teams', 'GET', undefined, 'forged');
            assert.equal(unauthorized.status, 401);
            assert.match(unauthorized.headers.get('content-type'), /json/);
            const signed = await request('/api/auth/login', 'POST', { tg_id: login, password });
            assert.equal(signed.status, 200);
            assert.equal(signed.headers.get('set-cookie'), null);
            const token = (await signed.json()).user.token;
            const session = await request('/api/auth/protected', 'GET', undefined, token);
            assert.equal((await session.json()).user.id, actor.id);
            const created = await request('/api/teams/create', 'POST', { nameTeam: 'Proxy smoke', usersId: [actor.id] }, token);
            assert.equal(created.status, 200);
            const id = (await created.json()).task.id;
            assert.equal((await (await request(`/api/teams/view/${id}`, 'GET', undefined, token)).json()).view.length, 1);
            assert.equal((await request(`/api/teams/delete/${id}`, 'DELETE', undefined, token)).status, 200);
            assert.equal((await request(`/api/teams/delete/${id}`, 'DELETE', undefined, token)).status, 404);
            const taskPayload = { content: 'Proxy task smoke', id_user: actor.id,
                start_date: '2026-01-01T12:00:00.000Z', end_date: '2099-01-01T00:00:00.000Z' };
            const taskCreated = await request('/api/tasks/new', 'POST', taskPayload, token);
            assert.equal(taskCreated.status, 200);
            const createdTaskBody = await taskCreated.json();
            assert.equal(createdTaskBody.checkVacation, false);
            const task = createdTaskBody.task;
            assert.ok(task.id > 0);
            assert.equal(Number(task.id_user), actor.id);
            assert.equal(task.status, false);
            for (const dates of [{ end_date: '2099-01-02' }, { date: '2099-01-03T00:00:00Z' }]) {
                const changed = await request(`/api/tasks/update/${task.id}`, 'PUT', { content: 'Proxy updated task', status: false, ...dates }, token);
                assert.equal(changed.status, 200);
                assert.equal((await changed.json()).id, task.id);
            }
            assert.equal((await request(`/api/tasks/update/${task.id}`, 'PUT', { content: 'Conflict', status: false,
                end_date: '2099-01-04', date: '2099-01-05' }, token)).status, 400);
            assert.equal((await request('/api/tasks/update/2147483647', 'PUT', { content: 'Missing', status: false, end_date: '2099-01-01' }, token)).status, 404);
            assert.equal((await request('/api/tasks/delete/2147483647', 'DELETE', undefined, token)).status, 404);
            const disposableTask = await request('/api/tasks/new', 'POST', { ...taskPayload, content: 'Proxy disposable task' }, token);
            assert.equal(disposableTask.status, 200);
            const disposableId = (await disposableTask.json()).task.id;
            const deletedTask = await request(`/api/tasks/delete/${disposableId}`, 'DELETE', undefined, token);
            assert.equal(deletedTask.status, 200);
            assert.equal((await deletedTask.json()).task.rowCount, 1);
            assert.equal((await request(`/api/tasks/delete/${disposableId}`, 'DELETE', undefined, token)).status, 404);
            const reportBody = { id_task: task.id, text_report: '😀'.repeat(255), end_date: '2026-11-15T00:00:00+03:00' };
            assert.equal((await request('/api/reports/new', 'POST', { ...reportBody, end_date: '2026-02-30' }, token)).status, 400);
            assert.equal((await request('/api/reports/new', 'POST', reportBody, token)).status, 200);
            const report = (await pool.query("SELECT text_report,to_char(end_date,'YYYY-MM-DD') AS date FROM report_list WHERE id_task=$1", [task.id])).rows[0];
            assert.equal(report.text_report, reportBody.text_report);
            assert.equal(report.date, '2026-11-15');
            const tasks = (await (await request(`/api/users/${actor.id}/tasks`, 'GET', undefined, token)).json()).user;
            assert.equal(tasks.some(item => item.id === task.id), false);
            assert.equal((await request('/api/auth/recPass', 'POST', { tg_id: login })).status, 410);
            const passwordAccount = `proxy-password-${label}-${Date.now()}`;
            const passwordUser = await request('/api/auth/createUser', 'POST', {
                fname: 'Password', lname: 'Proxy', tg_id: passwordAccount, post: 'Test', role: 2, pass: 'Assigned proxy password'
            }, token);
            assert.equal(passwordUser.status, 201);
            const passwordUserId = (await passwordUser.json()).user.id;
            const passwordLogin = async (password) => {
                const response = await request('/api/auth/login', 'POST', { tg_id: passwordAccount, password });
                assert.equal(response.status, 200);
                return (await response.json()).user;
            };
            const beforeReset = await passwordLogin('Assigned proxy password');
            assert.equal(beforeReset.passwordChangeRecommended, true);
            assert.equal((await request(`/api/auth/users/${passwordUserId}/reset-password`, 'POST', {
                currentPassword: password, newPassword: 'Reset proxy password', confirmPassword: 'Reset proxy password'
            }, token)).status, 200);
            assert.equal((await request('/api/auth/protected', 'GET', undefined, beforeReset.token)).status, 401);
            const afterReset = await passwordLogin('Reset proxy password');
            assert.equal((await request('/api/auth/change-password', 'POST', {
                currentPassword: 'Reset proxy password', newPassword: 'Personal proxy password', confirmPassword: 'Personal proxy password'
            }, afterReset.token)).status, 200);
            assert.equal((await request('/api/auth/protected', 'GET', undefined, afterReset.token)).status, 401);
            assert.equal((await passwordLogin('Personal proxy password')).passwordChangeRecommended, false);
            for (const path of ['/recPass', '/recAns', '/recPass/newPass']) {
                assert.equal((await request('/api/auth' + path, 'POST', { tg_id: passwordAccount })).status, 410);
            }
            assert.equal((await request(`/api/auth/delUser/${passwordUserId}`, 'DELETE', undefined, token)).status, 201);
            const missing = await request('/api/no-such-route?token=synthetic-private-proxy');
            assert.equal(missing.status, 404);
            assert.match(missing.headers.get('content-type'), /application\/json/);
            assert.equal(missing.headers.get('cache-control'), 'no-store');
            assert.deepEqual(await missing.json(), { message: 'Маршрут API не найден' });
            for (const [body, extraHeaders, status, message] of [
                ['{"password":"synthetic-private-proxy"', {}, 400, 'Некорректный JSON'],
                [JSON.stringify({ password: 'synthetic-private-proxy', padding: 'x'.repeat(102400) }), {}, 413, 'Превышен допустимый размер запроса'],
                ['{}', { 'Content-Type': 'application/json; charset=synthetic-private-proxy' }, 415, 'Неподдерживаемая кодировка запроса'],
                ['{}', { 'Content-Encoding': 'synthetic-private-proxy' }, 415, 'Неподдерживаемая кодировка запроса'],
                ['synthetic-private-proxy', { 'Content-Encoding': 'gzip' }, 400, 'Некорректный запрос']
            ]) {
                const technical = await fetch(origin + '/api/auth/login', { method: 'POST', body,
                    headers: { Host: 'localhost', 'Content-Type': 'application/json', 'X-Auth-Mode': 'bearer', Authorization: 'Bearer synthetic-private-proxy', ...extraHeaders } });
                assert.equal(technical.status, status);
                assert.match(technical.headers.get('content-type'), /application\/json/);
                assert.equal(technical.headers.get('cache-control'), 'no-store');
                assert.deepEqual(await technical.json(), { message });
            }
            const docs = await request('/api-docs/');
            assert.equal(docs.status, 200);
            assert.match(await docs.text(), /Swagger UI/);
            assert.match(await (await request('/api-docs/swagger-ui-init.js')).text(), /"url": "\/"/);
            // The /api-docs route must not be rewritten to /api or the SPA.
            const workerJwt = token;
            await pool.query('UPDATE users SET role=2 WHERE id=$1', [actor.id]);
            assert.equal((await request('/api/teams', 'GET', undefined, workerJwt)).status, 403);
            await pool.query('UPDATE users SET role=1 WHERE id=$1', [actor.id]);
            assert.equal((await request('/api/auth/logout', 'POST', {}, token)).status, 200);
            assert.equal((await request('/api/auth/protected', 'GET', undefined, token)).status, 401);
            console.log(`PASS proxy: ${label} SPA, login/cookie/Bearer, task CRUD/end_date/date/404, report completion, password change/reset/recovery 410, Swagger, logout/revocation, JSON 400/401/403/404/413/415`);
        }
        // Both proxies share the existing per-account limiter; forged XFF cannot reset it.
        for (let index = 0; index < 12; index++) {
            const response = await fetch('http://proxy-nginx/api/auth/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Mode': 'bearer', 'X-Forwarded-For': `192.0.2.${index + 1}` },
                body: JSON.stringify({ tg_id: login, password: 'wrong-synthetic' })
            });
            if (index >= 10) {
                assert.equal(response.status, 429);
                assert.ok(response.headers.get('retry-after'));
            }
        }
        console.log('PASS proxy: 429 and Retry-After preserved; forged XFF does not bypass account limits');
    } finally { await pool.end(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
