// Run with Node >=22 against a dedicated headless Chrome and the test static server.
// Every request to the existing API is intercepted before the network; no real backend is used.
import assert from 'node:assert/strict';

const [debugPort, origin] = process.argv.slice(2);
assert.match(debugPort || '', /^\d+$/);
assert.match(origin || '', /^http:\/\/127\.0\.0\.1:\d+$/);
assert.equal(typeof WebSocket, 'function', 'Use Node >=22');
const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
const target = targets.find((entry) => entry.type === 'page');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let nextId = 0;
const pendingCalls = new Map();
function call(method, params = {}) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pendingCalls.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
        pendingCalls.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
    });
}
const records = [];
const exceptions = [];
const interceptionErrors = [];
let mode = 'worker';
let holdSession = false;
let pendingSessions = [];
const actor = () => ({ id: mode === 'manager' || mode === 'management403' ? 1 : 2,
    role: mode === 'manager' || mode === 'management403' ? 1 : 2,
    fname: 'Synthetic', lname: 'Test', tg_id: 'synthetic-test', post: 'Test' });
const headers = [
    ['Content-Type', 'application/json'], ['Access-Control-Allow-Origin', origin],
    ['Access-Control-Allow-Credentials', 'true'], ['Access-Control-Allow-Headers', 'content-type,authorization'],
    ['Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS'], ['Cache-Control', 'no-store']
].map(([name, value]) => ({ name, value }));
async function respond(event, status, data) {
    await call('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: status, responseHeaders: headers,
        body: status === 204 ? '' : Buffer.from(JSON.stringify(data)).toString('base64') });
}
async function intercept(event) {
    const path = new URL(event.request.url).pathname;
    if (event.request.method === 'OPTIONS') return respond(event, 204, null);
    records.push({ path, hasBearer: /^Bearer /.test(event.request.headers.Authorization || event.request.headers.authorization || '') });
    if (path === '/api/auth/protected') {
        if (holdSession) { pendingSessions.push(event); return; }
        if (mode === 'expired') return respond(event, 401, { message: 'Недействительная сессия' });
        if (mode === 'unavailable') return respond(event, 500, { message: 'Ошибка сервера' });
        return respond(event, 200, { user: actor() });
    }
    if (path === '/api/auth/login') return respond(event, 200, { user: { ...actor(), token: 'synthetic-session' } });
    if (mode === 'task401' && path.endsWith('/tasks')) return respond(event, 401, { message: 'Недействительная сессия' });
    if (mode === 'management403' && path === '/api/users') return respond(event, 403, { message: 'Доступ запрещён' });
    if (path === '/api/users') return respond(event, 200, []);
    if (path.endsWith('/tasks')) return respond(event, 201, { user: [] });
    return respond(event, 404, { message: 'Synthetic test route not found' });
}
socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
        const pending = pendingCalls.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        pendingCalls.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result);
    } else if (message.method === 'Fetch.requestPaused') {
        intercept(message.params).catch((error) => interceptionErrors.push(error.message));
    } else if (message.method === 'Runtime.exceptionThrown') {
        exceptions.push(message.params.exceptionDetails.text);
    }
});
const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
};
async function until(predicate) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        try { if (await predicate()) return; } catch { /* Navigation replaces the execution context. */ }
        await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new Error('Browser assertion timeout');
}
const hasText = (text) => evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`);
const navigate = (path) => call('Page.navigate', { url: origin + path });
const cookie = (name, value) => call('Network.setCookie', { name, value, url: origin, path: '/' });
const clearCookies = () => call('Network.clearBrowserCookies');
const hasToken = () => evaluate("document.cookie.split(';').some(part => part.trim().startsWith('token='))");
let passed = 0;
function pass(name) { console.log(`PASS browser: ${name}`); passed++; }
try {
    await call('Page.enable');
    await call('Runtime.enable');
    await call('Network.enable');
    await call('Network.setBlockedURLs', { urls: ['https://*'] });
    await call('Fetch.enable', { patterns: [{ urlPattern: 'http://localhost:5001/*', requestStage: 'Request' }] });

    await clearCookies();
    await navigate('/tasks');
    await until(() => evaluate("location.pathname === '/login'"));
    assert.equal(records.length, 0);
    pass('anonymous navigation redirects to login without business requests');

    await cookie('token', 'synthetic-session');
    await cookie('userData', encodeURIComponent(JSON.stringify({ id: 1, role: 1 })));
    holdSession = true;
    await navigate('/users');
    await until(() => hasText('Проверка сессии'));
    await until(async () => pendingSessions.length > 0);
    assert.equal(records.some((entry) => entry.path === '/api/users'), false);
    holdSession = false;
    for (const event of pendingSessions) await respond(event, 200, { user: actor() });
    pendingSessions = [];
    await until(() => hasText('Недостаточно прав для этой страницы'));
    assert.equal(records.some((entry) => entry.path === '/api/users'), false);
    assert.ok(records.filter((entry) => entry.path === '/api/auth/protected').every((entry) => entry.hasBearer));
    pass('server role overrides forged cookie; protected page waits and stays blocked');

    await cookie('userData', 'not-valid-json');
    await navigate('/tasks');
    await until(() => hasText('Список задач'));
    await until(async () => records.some((entry) => entry.path === '/api/users/2/tasks'));
    pass('worker loads only own tasks and malformed userData cannot crash the app');

    mode = 'task401';
    await navigate('/tasks');
    await until(() => evaluate("location.pathname === '/login'"));
    assert.equal(await hasToken(), false);
    pass('401 on a protected business request clears session and redirects');

    mode = 'unavailable';
    await cookie('token', 'synthetic-session');
    await navigate('/tasks');
    await until(() => hasText('Не удалось проверить сессию'));
    assert.equal(await hasToken(), true);
    mode = 'worker';
    await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Повторить').click()");
    await until(() => hasText('Список задач'));
    pass('temporary server failure keeps token and retry restores access');

    mode = 'manager';
    const before = records.filter((entry) => entry.path === '/api/users').length;
    await navigate('/users');
    await until(async () => records.filter((entry) => entry.path === '/api/users').length > before);
    pass('verified manager can load management data');

    await navigate('/login');
    await until(() => hasText('Войти'));
    await evaluate(`for (const [placeholder, value] of [['Логин','synthetic-test'],['Пароль','synthetic-pass']]) {
        const input = document.querySelector('input[placeholder="'+placeholder+'"]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);
        input.dispatchEvent(new Event('input',{bubbles:true}));
    }`);
    const checks = records.filter((entry) => entry.path === '/api/auth/protected').length;
    await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Войти').click()");
    await until(() => evaluate("location.pathname === '/users'"));
    await until(async () => records.filter((entry) => entry.path === '/api/auth/protected').length > checks);
    await until(async () => !(await hasText('Проверка сессии')));
    assert.equal(records.filter((entry) => entry.path === '/api/auth/login').at(-1).hasBearer, false);
    pass('login revalidates even when the returned token equals the current one');

    mode = 'management403';
    await navigate('/users');
    await until(() => hasText('Недостаточно прав для этого действия'));
    assert.equal(await hasToken(), true);
    assert.equal(await evaluate('location.pathname'), '/users');
    pass('403 shows an access error and preserves session');

    mode = 'expired';
    await navigate('/tasks');
    await until(() => evaluate("location.pathname === '/login'"));
    assert.equal(await hasToken(), false);
    pass('expired session is rejected during initial verification');
    assert.deepEqual(interceptionErrors, []);
    assert.deepEqual(exceptions, []);
    console.log(`Browser scenarios passed: ${passed}; API responses are synthetic, no working backend contacted`);
} finally {
    socket.close();
}
