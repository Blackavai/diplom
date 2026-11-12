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
            console.log('Synthetic browser fixture ready');
            return;
        }
        const login = `proxy-smoke-${Date.now()}`;
        const actor = (await pool.query(`INSERT INTO users(fname,lname,tg_id,role,post,password,question,answer)
            VALUES ('Proxy','Smoke',$1,1,'Test',$2,'Synthetic question','synthetic-answer') RETURNING id`, [login, hash])).rows[0];
        for (const origin of ['http://proxy-nginx', 'http://proxy-vite:5173']) {
            const label = new URL(origin).hostname;
            const request = async (path, method = 'GET', body, token) => fetch(origin + path, {
                method, headers: { Host: 'localhost', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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
            assert.match(signed.headers.get('set-cookie'), /token=/);
            const token = (await signed.json()).user.token;
            const session = await request('/api/auth/protected', 'GET', undefined, token);
            assert.equal((await session.json()).user.id, actor.id);
            const created = await request('/api/teams/create', 'POST', { nameTeam: 'Proxy smoke', usersId: [actor.id] }, token);
            assert.equal(created.status, 200);
            const id = (await created.json()).task.id;
            assert.equal((await (await request(`/api/teams/view/${id}`, 'GET', undefined, token)).json()).view.length, 1);
            assert.equal((await request(`/api/teams/delete/${id}`, 'DELETE', undefined, token)).status, 200);
            assert.equal((await request(`/api/teams/delete/${id}`, 'DELETE', undefined, token)).status, 404);
            assert.equal((await request('/api/auth/recPass', 'POST', { tg_id: login })).status, 200);
            assert.equal((await request('/api/no-such-route')).status, 404);
            const docs = await request('/api-docs/');
            assert.equal(docs.status, 200);
            assert.match(await docs.text(), /Swagger UI/);
            assert.match(await (await request('/api-docs/swagger-ui-init.js')).text(), /"url": "\/"/);
            // The /api-docs route must not be rewritten to /api or the SPA.
            const workerJwt = require('jsonwebtoken').sign({ id: actor.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
            await pool.query('UPDATE users SET role=2 WHERE id=$1', [actor.id]);
            assert.equal((await request('/api/teams', 'GET', undefined, workerJwt)).status, 403);
            await pool.query('UPDATE users SET role=1 WHERE id=$1', [actor.id]);
            console.log(`PASS proxy: ${label} SPA, login/cookie/Bearer, CRUD, recovery, Swagger, 401/403/404`);
        }
        // Both proxies share the existing per-account limiter; forged XFF cannot reset it.
        for (let index = 0; index < 12; index++) {
            const response = await fetch('http://proxy-nginx/api/auth/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `192.0.2.${index + 1}` },
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
