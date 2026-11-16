// Выделенный Chrome и искусственный API: рабочие сервисы/данные не используются.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const [port, origin, screenshotsDirectory] = process.argv.slice(2);
assert.match(port || '', /^\d+$/);
assert.match(origin || '', /^http:\/\/127\.0\.0\.1:\d+$/);
const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const socket = new WebSocket(pages.find((page) => page.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
let nextId = 0;
const calls = new Map();
const errors = [];
const requests = [];
const documents = [];
const loadedDocuments = new Set();
let currentLoader = null;
const heldSessions = [];
const heldChanges = [];
let status = 200;
let holdSession = false;
let user = { id: 22, role: 2, fname: 'Личное имя', lname: 'Тест', tg_id: 'own-account', post: 'Разработчик', passwordChangeRecommended: false };
function call(method, params = {}) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { calls.delete(id); reject(new Error('CDP timeout: ' + method)); }, 10000);
        calls.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
}
const respond = (event, code, data) => call('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: code,
    responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Cache-Control', value: 'no-store' }],
    body: Buffer.from(JSON.stringify(data)).toString('base64') });
const sessionBody = () => status === 200 ? { user, sessionId: 'a'.repeat(32), csrfToken: 'b'.repeat(64) } : { message: 'Synthetic session failure' };
async function intercept(event) {
    const path = new URL(event.request.url).pathname;
    requests.push({ path, method: event.request.method, body: event.request.postData ? JSON.parse(event.request.postData) : null });
    if (path === '/api/auth/protected') {
        if (holdSession) { heldSessions.push(event); return; }
        return respond(event, status, sessionBody());
    }
    if (path === '/api/auth/change-password') { heldChanges.push(event); return; }
    if (path.endsWith('/tasks')) return respond(event, 201, { user: [] });
    return respond(event, 404, { message: 'Unexpected synthetic route' });
}
socket.addEventListener('message', ({ data }) => {
    const event = JSON.parse(data);
    if (event.id) {
        const pending = calls.get(event.id); if (!pending) return;
        clearTimeout(pending.timer); calls.delete(event.id);
        if (event.error) pending.reject(new Error(event.error.message)); else pending.resolve(event.result);
    } else if (event.method === 'Page.frameNavigated' && !event.params.frame.parentId) {
        currentLoader = event.params.frame.loaderId;
    } else if (event.method === 'Page.lifecycleEvent' && event.params.name === 'load') {
        loadedDocuments.add(event.params.loaderId);
    } else if (event.method === 'Fetch.requestPaused') intercept(event.params).catch((error) => errors.push(error.message));
    else if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.text);
    else if (event.method === 'Network.responseReceived' && event.params.type === 'Document') {
        documents.push({ path: new URL(event.params.response.url).pathname, status: event.params.response.status });
    }
});
async function evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error('Browser JavaScript failed');
    return result.result.value;
}
async function until(expression) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        try { if (await evaluate(expression)) return; } catch { /* Навигация заменяет контекст. */ }
        await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new Error('Browser condition timed out: ' + expression);
}
async function waitHeld(list) {
    const deadline = Date.now() + 10000;
    while (!list.length && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 30));
    assert.ok(list.length, 'Expected an intercepted request');
    return list.shift();
}
async function navigate(path) {
    await evaluate("localStorage.removeItem('dailysync.session-event')");
    const navigation = await call('Page.navigate', { url: origin + path });
    const deadline = Date.now() + 10000;
    while (!loadedDocuments.has(navigation.loaderId) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 30));
    }
    assert.ok(loadedDocuments.has(navigation.loaderId), 'Navigation must finish loading');
}
const ready = () => until("Boolean(document.querySelector('.settings-profile')) && !document.body.innerText.includes('Проверка сессии')");
const click = (label) => evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent===${JSON.stringify(label)}).click()`);
const fill = (index, value) => evaluate(`{const input=document.querySelectorAll('.password-form input')[${index}];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));}`);
async function fillPasswords() { await fill(0, 'Synthetic current password'); await fill(1, 'Synthetic new password'); await fill(2, 'Synthetic new password'); }
const submit = () => evaluate("{const button=document.querySelector('.password-form button[type=submit]');button.click();button.click();}");
async function screenshot(name) {
    if (!screenshotsDirectory) return;
    const result = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(screenshotsDirectory, name + '.png'), Buffer.from(result.data, 'base64'));
}
async function enter() {
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter' });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' });
}
let passed = 0;
const pass = (message) => { passed++; console.log('PASS settings: ' + message); };
try {
    await call('Page.enable'); await call('Page.setLifecycleEventsEnabled', { enabled: true });
    await call('Runtime.enable'); await call('Network.enable');
    await call('Network.setBlockedURLs', { urls: ['https://*'] });
    await call('Fetch.enable', { patterns: [{ urlPattern: origin + '/api/*', requestStage: 'Request' }] });
    await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url: origin + '/login' });
    await until("Boolean(document.querySelector('input[placeholder=Логин]'))");
    status = 401; await navigate('/settings');
    await until("location.pathname==='/login' && Boolean(document.querySelector('input[placeholder=Логин]'))");
    assert.equal(await evaluate("Boolean(document.querySelector('.settings-profile, .password-form, a[aria-label=\"Личные настройки\"]'))"), false);
    pass('anonymous settings open redirects to login without profile data or password fields');

    status = 500; holdSession = true; await navigate('/settings');
    const firstSession = await waitHeld(heldSessions);
    assert.equal(await evaluate("document.body.innerText.includes('Проверка сессии')"), true);
    assert.equal(await evaluate("Boolean(document.querySelector('.settings-profile, .password-form'))"), false);
    holdSession = false; await respond(firstSession, status, sessionBody());
    for (const event of heldSessions.splice(0)) await respond(event, status, sessionBody());
    await until("document.body.innerText.includes('Не удалось проверить сессию')");
    assert.equal(await evaluate("Boolean(document.querySelector('.settings-profile'))"), false);
    status = 200; await click('Повторить'); await ready();
    pass('initial session check hides private data; a temporary error offers retry and recovers');

    user = { ...user, id: 11, role: 1, fname: '<strong>Личное имя</strong>' };
    await navigate('/settings?id=999'); await ready();
    const values = await evaluate("Array.from(document.querySelectorAll('.settings-profile dd')).map(field=>field.textContent)");
    assert.deepEqual(values, [user.fname, user.lname, user.tg_id, user.post, 'Менеджер']);
    assert.equal(await evaluate("Boolean(document.querySelector('.settings-profile input, .settings-profile select, .settings-profile strong'))"), false);
    assert.equal(requests.some((request) => request.path.startsWith('/api/users')), false);
    pass('settings read only the verified own profile; URL id cannot select another user and text is escaped');

    await navigate('/tasks'); await until("Boolean(document.querySelector('.item_auth .settings-link'))");
    await evaluate("document.querySelector('.item_auth .settings-link').focus()"); await enter(); await ready();
    assert.equal(await evaluate('location.pathname'), '/settings');
    assert.equal(await evaluate("document.querySelector('.item_auth .settings-link').nextElementSibling.getAttribute('aria-label')"), 'Выйти');
    assert.equal(await evaluate("document.querySelector('.item_auth .settings-link').getAttribute('aria-current')"), 'page');
    pass('desktop gear is next to logout, labelled and opens settings with the keyboard');

    user = { ...user, id: 22, role: 2, fname: 'Личное имя' };
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await navigate('/tasks'); await until("Boolean(document.querySelector('.item_auth .settings-link'))");
    await evaluate("document.querySelector('.sideBarHeader').click()");
    await until("Boolean(document.querySelector('.sidebar .settings-link'))");
    assert.equal(await evaluate("document.querySelector('.sidebar .settings-link').nextElementSibling.getAttribute('aria-label')"), 'Выйти');
    await new Promise((resolve) => setTimeout(resolve, 300));
    const mobileGear = await evaluate("{const rect=document.querySelector('.sidebar .settings-link').getBoundingClientRect();({left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom})}");
    assert.ok(mobileGear.left>=0 && mobileGear.top>=0 && mobileGear.right<=390 && mobileGear.bottom<=844, 'Mobile gear must stay inside the viewport: '+JSON.stringify(mobileGear));
    await screenshot('settings-menu-mobile');
    await evaluate("document.querySelector('.sidebar .settings-link').focus()"); await enter();
    await ready(); await until("!document.querySelector('[role=dialog]')");
    assert.equal(await evaluate("document.querySelector('.settings-profile').textContent.includes('Работник')"), true);
    pass('worker mobile gear opens own settings and closes the dialog after keyboard activation');

    const longText = 'ОченьДлинныеЛичныеДанные'.repeat(12);
    for (const role of [1, 2]) {
        user = { ...user, role, lname: longText, post: longText };
        for (const width of [360, 390, 768, 1280]) {
            await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: false });
            await navigate('/settings'); await ready();
            assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true);
            await evaluate("document.querySelector('.password-form button[type=submit]').scrollIntoView({block:'center'})");
            assert.equal(await evaluate("{const rect=document.querySelector('.password-form button[type=submit]').getBoundingClientRect();rect.top>=0&&rect.bottom<=innerHeight}"), true);
        }
    }
    user = { ...user, lname: 'Тест', post: 'Разработчик' };
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await navigate('/settings'); await ready(); await screenshot('settings-mobile');
    await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await navigate('/settings'); await ready(); await screenshot('settings-desktop');
    pass('both roles fit 360/390/768/1280 viewports with long data and can scroll to the password action');

    await fillPasswords();
    holdSession = true; await evaluate("window.dispatchEvent(new Event('focus'))");
    const checking = await waitHeld(heldSessions);
    assert.equal(await evaluate("document.querySelector('.password-form button[type=submit]').disabled"), true);
    assert.equal(await evaluate("document.querySelector('.password-form input').value.length"), 'Synthetic current password'.length);
    status = 500; holdSession = false; await respond(checking, status, sessionBody());
    for (const event of heldSessions.splice(0)) await respond(event, status, sessionBody());
    await until("document.body.innerText.includes('Не удалось проверить сессию')");
    assert.equal(await evaluate("document.querySelector('.password-form input').value.length"), 'Synthetic current password'.length);
    assert.equal(await evaluate("document.querySelector('.password-form button[type=submit]').disabled"), true);
    status = 200; await click('Повторить'); await ready();
    assert.equal(await evaluate("document.querySelector('.password-form input').value.length"), 'Synthetic current password'.length);
    pass('background checking and temporary failure preserve the draft while blocking submission until retry');

    await submit(); const rejected = await waitHeld(heldChanges);
    assert.equal(requests.filter((request) => request.path === '/api/auth/change-password').length, 1);
    assert.deepEqual(Object.keys(JSON.parse(rejected.request.postData)).sort(), ['confirmPassword', 'currentPassword', 'newPassword']);
    assert.equal(await evaluate("Array.from(document.querySelectorAll('.password-form input')).every(input=>input.disabled)"), true);
    await respond(rejected, 403, { message: 'Текущий пароль не подтверждён' });
    await until("document.body.innerText.includes('Текущий пароль не подтверждён')");
    assert.equal(await evaluate("document.querySelector('.password-form input').value.length"), 'Synthetic current password'.length);
    pass('settings reuse the own-password API, block double submit and retain input after rejection');

    await submit(); const late = await waitHeld(heldChanges);
    user = { ...user, id: 33, role: 1, fname: 'Другой пользователь' };
    await evaluate("window.dispatchEvent(new Event('focus'))");
    await until("Boolean(document.querySelector('.settings-profile')) && document.querySelector('.settings-profile').textContent.includes('Другой пользователь')");
    assert.equal(await evaluate("Array.from(document.querySelectorAll('.password-form input')).every(input=>input.value==='')"), true);
    await respond(late, 200, { success: true });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(await evaluate('location.pathname'), '/settings');
    assert.equal(await evaluate("document.querySelector('.settings-profile').textContent.includes('Другой пользователь')"), true);
    pass('account switching clears the previous draft and ignores its late successful password response');

    await fillPasswords(); await submit(); const expired = await waitHeld(heldChanges);
    await respond(expired, 401, { message: 'Недействительная сессия' });
    await until("location.pathname==='/login'");
    assert.equal(await evaluate("Boolean(document.querySelector('.settings-profile, .password-form'))"), false);
    pass('expired session removes own profile and password fields before returning to login');

    user = { ...user, id: 44, role: 2 }; await navigate('/settings'); await ready();
    await fillPasswords(); await submit(); const changed = await waitHeld(heldChanges);
    await respond(changed, 200, { success: true });
    await until("location.pathname==='/login' && Boolean(document.querySelector('input[placeholder=Пароль]'))");
    assert.equal(await evaluate("document.querySelector('input[placeholder=Пароль]').value"), '');
    pass('successful settings password change clears the session and returns to an empty login form');

    await navigate('/settings'); await ready();
    const previousLoader = currentLoader;
    await call('Page.reload');
    const reloadDeadline = Date.now() + 10000;
    while ((currentLoader === previousLoader || !loadedDocuments.has(currentLoader)) && Date.now() < reloadDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 30));
    }
    assert.notEqual(currentLoader, previousLoader);
    assert.ok(loadedDocuments.has(currentLoader));
    await ready();
    const settingsDocuments = documents.filter((document) => document.path === '/settings');
    assert.ok(settingsDocuments.length > 1);
    assert.ok(settingsDocuments.every((document) => document.status === 200));
    assert.equal(await evaluate("document.querySelector('.settings-profile').textContent.includes('Другой пользователь')"), true);
    assert.deepEqual(errors, []);
    console.log(`Browser settings scenarios passed: ${passed + 1}; synthetic API, SPA direct open/reload 200`);
} catch (error) {
    console.error('Settings diagnostics:', await evaluate("({path:location.pathname,profile:Boolean(document.querySelector('.settings-profile')),fields:Array.from(document.querySelectorAll('.password-form input')).map(input=>({length:input.value.length,disabled:input.disabled}))})").catch(() => null));
    throw error;
} finally { socket.close(); }
