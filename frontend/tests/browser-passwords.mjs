// Только выделенный Chrome и искусственный API; рабочая БД не используется.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const [port, origin, screenshotPath] = process.argv.slice(2);
assert.match(port || '', /^\d+$/);
assert.match(origin || '', /^http:\/\/127\.0\.0\.1:\d+$/);
const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const socket = new WebSocket(pages.find((page) => page.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
let nextId = 0;
const calls = new Map();
const errors = [];
const requests = [];
const held = [];
let role = 2;
let recommended = true;
const user = () => ({ id: role === 1 ? 1 : 2, role, fname: 'Synthetic', lname: 'Test', tg_id: 'test', post: 'Test', passwordChangeRecommended: recommended });
function call(method, params = {}) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { calls.delete(id); reject(new Error('CDP timeout: ' + method)); }, 10000);
        calls.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
}
const respond = (event, status, data) => call('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: status,
    responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Cache-Control', value: 'no-store' }],
    body: Buffer.from(JSON.stringify(data)).toString('base64') });
async function intercept(event) {
    const path = new URL(event.request.url).pathname;
    const method = event.request.method;
    requests.push({ path, method, body: event.request.postData ? JSON.parse(event.request.postData) : null });
    if (path === '/api/auth/protected') return respond(event, 200, { user: user(), sessionId: 'a'.repeat(32), csrfToken: 'b'.repeat(64) });
    if (path === '/api/auth/login') return respond(event, 200, { user: user() });
    if (path === '/api/auth/change-password' || path.endsWith('/reset-password')) { held.push(event); return; }
    if (path.startsWith('/api/auth/rec')) return respond(event, 410, { message: 'Обратитесь к менеджеру' });
    if (path === '/api/users') return respond(event, 200, [{ id: 2, fname: 'Employee', lname: 'Test', tg_id: 'worker', post: 'Test' }]);
    if (path.endsWith('/tasks')) return respond(event, 201, { user: [] });
    if (path.endsWith('/team') || path.endsWith('/vacation')) return respond(event, 201, { user: 'Отсутствует' });
    return respond(event, 404, { message: 'Synthetic route not found' });
}
socket.addEventListener('message', ({ data }) => {
    const event = JSON.parse(data);
    if (event.id) {
        const pending = calls.get(event.id); if (!pending) return;
        clearTimeout(pending.timer); calls.delete(event.id);
        if (event.error) pending.reject(new Error(event.error.message)); else pending.resolve(event.result);
    } else if (event.method === 'Fetch.requestPaused') intercept(event.params).catch((error) => errors.push(error.message));
    else if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.text);
});
async function evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error('Browser JavaScript failed');
    return result.result.value;
}
async function until(expression, timeout = 10000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        try { if (await evaluate(expression)) return; } catch { /* Навигация заменяет контекст. */ }
        await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new Error('Browser condition timed out: ' + expression);
}
async function navigate(path) {
    await evaluate("localStorage.removeItem('dailysync.session-event')");
    await call('Page.navigate', { url: origin + path });
    await until("!document.body.innerText.includes('Проверка сессии') && Boolean(document.querySelector('.item_auth button'))");
}
const fill = (index, value) => evaluate(`{const input=document.querySelectorAll('.password-form input')[${index}];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));}`);
async function fillPasswords(current, next, confirmation = next) { await fill(0, current); await fill(1, next); await fill(2, confirmation); }
const submit = () => evaluate("{const button=document.querySelector('.password-form button[type=submit]');button.click();button.click();}");
async function take(path) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        const index = held.findIndex((event) => new URL(event.request.url).pathname === path);
        if (index >= 0) return held.splice(index, 1)[0];
        await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new Error('Expected synthetic request not received');
}
const count = (path) => requests.filter((entry) => entry.path === path).length;
let passed = 0;
const pass = (message) => { passed++; console.log('PASS passwords: ' + message); };
try {
    await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
    await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await call('Network.setBlockedURLs', { urls: ['https://*'] });
    await call('Fetch.enable', { patterns: [{ urlPattern: origin + '/api/*', requestStage: 'Request' }] });
    await call('Page.navigate', { url: origin + '/login' });
    await until("Boolean(document.querySelector('input[placeholder=Логин]'))");
    await navigate('/tasks');
    await until("document.body.innerText.includes('Рекомендуем сменить пароль')");
    assert.ok(requests.some((entry) => entry.path === '/api/users/2/tasks'));
    assert.equal(count('/api/auth/change-password'), 0);
    pass('recommendation offers a change link without restricting business access');

    await navigate('/change-password');
    await until("document.querySelectorAll('.password-form input').length===3");
    await fillPasswords('Old synthetic', 'New synthetic', 'Mismatch'); await submit();
    await until("Boolean(document.querySelector('.password-form [role=alert]'))");
    assert.equal(count('/api/auth/change-password'), 0);
    await fillPasswords('Same synthetic', 'Same synthetic'); await submit();
    assert.equal(count('/api/auth/change-password'), 0);
    pass('mismatched confirmation and unchanged password send no request');

    const longPassword = '  Personal 🔐'.repeat(170) + ' end ';
    await fillPasswords('Old synthetic', longPassword); await submit();
    const first = await take('/api/auth/change-password');
    assert.equal(count('/api/auth/change-password'), 1);
    assert.equal(JSON.parse(first.request.postData).newPassword, longPassword);
    const headers = Object.fromEntries(Object.entries(first.request.headers).map(([key, value]) => [key.toLowerCase(), value]));
    assert.equal(headers['x-csrf-token'], 'b'.repeat(64));
    assert.equal(await evaluate("Array.from(document.querySelectorAll('.password-form input')).every(input=>input.disabled)"), true);
    await respond(first, 403, { message: 'Текущий пароль не подтверждён' });
    await until("document.body.innerText.includes('Текущий пароль не подтверждён')");
    assert.equal(await evaluate("document.querySelectorAll('.password-form input')[1].value.length"), longPassword.length);
    pass('long password is intact, CSRF is sent, double submit is blocked and an error preserves input');

    await evaluate("window.dispatchEvent(new Event('focus'))");
    await until("!document.body.innerText.includes('Проверка сессии')");
    assert.equal(await evaluate("document.querySelectorAll('.password-form input')[1].value.length"), longPassword.length);
    pass('background session verification preserves the password form');

    await submit(); const changed = await take('/api/auth/change-password');
    recommended = false;
    await respond(changed, 200, { success: true });
    await until("location.pathname==='/login' && Boolean(document.querySelector('input[placeholder=Пароль]'))");
    assert.equal(await evaluate("document.querySelector('input[placeholder=Пароль]').value"), '');
    await navigate('/tasks');
    assert.equal(await evaluate("document.body.innerText.includes('Рекомендуем сменить пароль')"), false);
    assert.equal(await evaluate("Boolean(document.querySelector('a[href=\"/settings\"]'))"), true);
    pass('successful change clears local session and fields; the next session has no recommendation');

    await navigate('/change-password'); await fillPasswords('Old synthetic', 'New synthetic'); await submit();
    const timedOut = await take('/api/auth/change-password');
    await until("document.body.innerText.includes('Результат смены не подтверждён')", 22000);
    const afterTimeout = count('/api/auth/change-password');
    assert.equal(await evaluate("Boolean(document.querySelector('.password-form button[type=submit]'))"), false);
    assert.equal(await evaluate("Array.from(document.querySelectorAll('.password-form input')).every(input=>input.value==='')"), true);
    assert.equal(count('/api/auth/change-password'), afterTimeout);
    await respond(timedOut, 200, { success: true }).catch(() => {});
    pass('real timeout clears secrets and offers login without automatically resending a password change');

    role = 1; await navigate('/users');
    await until("Boolean(document.querySelector('.rowUser .row-action'))");
    await evaluate("document.querySelector('.rowUser .row-action').click()");
    await until("Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Сбросить пароль'&&!button.disabled)");
    await evaluate("Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Сбросить пароль').click()");
    await fillPasswords('Manager synthetic', 'Assigned synthetic'); await submit();
    const resetPath = '/api/auth/users/2/reset-password';
    const failedReset = await take(resetPath);
    assert.equal(count(resetPath), 1);
    assert.equal(await evaluate("Array.from(document.querySelectorAll('.password-form input')).every(input=>input.disabled)"), true);
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
    assert.equal(await evaluate("Boolean(document.querySelector('[role=dialog]'))"), true);
    await respond(failedReset, 403, { message: 'Пароль менеджера не подтверждён' });
    await until("document.body.innerText.includes('Пароль менеджера не подтверждён')");
    assert.equal(await evaluate("document.querySelectorAll('.password-form input')[1].value.length"), 'Assigned synthetic'.length);
    pass('manager reset confirms own password and preserves the form after rejection');

    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 640, deviceScaleFactor: 1, mobile: false });
    await evaluate("document.querySelector('.password-form button[type=submit]').scrollIntoView({block:'center'})");
    assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"), true);
    assert.equal(await evaluate("{const rect=document.querySelector('.password-form button[type=submit]').getBoundingClientRect();rect.top>=0&&rect.bottom<=innerHeight}"), true);
    if (screenshotPath) {
        const screenshot = await call('Page.captureScreenshot', { format: 'png' });
        await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    }
    pass('manager reset fits a mobile viewport and scrolls to the submit button');

    await submit(); const success = await take(resetPath); await respond(success, 200, { success: true });
    await until("!document.querySelector('[role=dialog]')");
    await evaluate("document.querySelector('.rowUser .row-action').click()");
    await until("Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Сбросить пароль'&&!button.disabled)");
    await evaluate("Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Сбросить пароль').click()");
    assert.equal(await evaluate("Array.from(document.querySelectorAll('.password-form input')).every(input=>input.value==='')"), true);
    pass('successful reset closes the dialog and reopening starts with empty password fields');

    await fillPasswords('Manager synthetic', 'Another assigned'); await submit();
    const uncertain = await take(resetPath); await respond(uncertain, 500, { message: 'Ошибка сервера' });
    await until("document.body.innerText.includes('Сброс мог выполниться')");
    assert.equal(await evaluate("document.querySelector('.password-form button[type=submit]').disabled"), true);
    assert.equal(count(resetPath), 3);
    pass('uncertain reset is not retried automatically and asks the manager to verify access');

    await navigate('/change-password'); await fillPasswords('Manager synthetic', 'New personal'); await submit();
    const expired = await take('/api/auth/change-password'); await respond(expired, 401, { message: 'Недействительная сессия' });
    await until("location.pathname==='/login'");
    assert.equal(await evaluate("Boolean(document.querySelector('.password-form'))"), false);
    pass('expired session unmounts the form and returns to login');
    assert.deepEqual(errors, []);
    console.log(`Browser password scenarios passed: ${passed}; synthetic API`);
} finally { socket.close(); }
