// Настоящий UI → тестовый proxy → API → синтетическая БД. Перехвата API нет.
import assert from 'node:assert/strict';
const [port, origin, label] = process.argv.slice(2);
assert.match(port || '', /^\d+$/);
assert.match(origin || '', /^http:\/\/127\.0\.0\.1:\d+$/);
assert.ok(['nginx', 'vite'].includes(label));
const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const socket = new WebSocket(pages.find((page) => page.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
let nextId = 0;
const calls = new Map();
const errors = [];
const responses = [];
function call(method, params = {}) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { calls.delete(id); reject(new Error('CDP timeout: ' + method)); }, 10000);
        calls.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
}
socket.addEventListener('message', ({ data }) => {
    const event = JSON.parse(data);
    if (event.id) {
        const pending = calls.get(event.id); if (!pending) return;
        clearTimeout(pending.timer); calls.delete(event.id);
        if (event.error) pending.reject(new Error(event.error.message)); else pending.resolve(event.result);
    } else if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.text);
    else if (event.method === 'Network.responseReceived' && event.params.response.url.startsWith(origin + '/api/')) {
        responses.push({ path: new URL(event.params.response.url).pathname, status: event.params.response.status });
    }
});
async function evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error('Browser JavaScript failed');
    return result.result.value;
}
async function until(expression) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        try { if (await evaluate(expression)) return; } catch { /* Навигация заменяет контекст. */ }
        await new Promise((resolve) => setTimeout(resolve, 40));
    }
    throw new Error('Browser condition timed out: ' + expression);
}
async function fill(selector, value) {
    await evaluate(`{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));}`);
}
const click = (text) => evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent===${JSON.stringify(text)}).click()`);
async function login(account, password, path) {
    await until("Boolean(document.querySelector('input[placeholder=Логин]'))");
    await fill('input[placeholder=Логин]', account); await fill('input[placeholder=Пароль]', password);
    await click('Войти');
    await until(`location.pathname===${JSON.stringify(path)} && !document.body.innerText.includes('Проверка сессии') && Boolean(document.querySelector('.item_auth button'))`);
}
async function logout() {
    const before = responses.filter((response) => response.path === '/api/auth/logout').length;
    await evaluate("document.querySelector('.item_auth button[aria-label=Выйти]').click()");
    await until("location.pathname==='/login'");
    const deadline = Date.now() + 10000;
    while (responses.filter((response) => response.path === '/api/auth/logout').length === before && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 30));
    }
    assert.equal(responses.filter((response) => response.path === '/api/auth/logout').at(-1).status, 200);
}
async function passwords(current, next) {
    await fill('.password-form label:nth-of-type(1) input', current);
    await fill('.password-form label:nth-of-type(2) input', next);
    await fill('.password-form label:nth-of-type(3) input', next);
    await until("!document.querySelector('.password-form button[type=submit]').disabled");
    await evaluate("document.querySelector('.password-form button[type=submit]').click()");
}
try {
    await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
    await call('Network.setBlockedURLs', { urls: ['https://*'] });
    await call('Network.clearBrowserCookies');
    await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url: origin + '/login' });
    await login('browser-password-worker-' + label, 'synthetic-proxy-password', '/tasks');
    await until("document.body.innerText.includes('Рекомендуем сменить пароль')");
    await evaluate("document.querySelector('.item_auth a[href=\"/change-password\"]').click()");
    await until("document.querySelectorAll('.password-form input').length===3");
    await passwords('synthetic-proxy-password', 'synthetic-personal-password');
    await until("location.pathname==='/login'");
    await login('browser-password-worker-' + label, 'synthetic-personal-password', '/tasks');
    assert.equal(await evaluate("document.body.innerText.includes('Рекомендуем сменить пароль')"), false);
    assert.equal(responses.find((response) => response.path === '/api/auth/change-password').status, 200);
    console.log('PASS real password browser: ' + label + ' recommendation, own change, new login and cleared recommendation');

    await logout();
    await login('browser-proxy-manager', 'synthetic-proxy-password', '/users');
    const employeeName = 'Browser password ' + label;
    await until(`Array.from(document.querySelectorAll('.rowUser')).some(row=>row.textContent.includes(${JSON.stringify(employeeName)}))`);
    await evaluate(`Array.from(document.querySelectorAll('.rowUser')).find(row=>row.textContent.includes(${JSON.stringify(employeeName)})).querySelector('.row-action').click()`);
    await until("Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Сбросить пароль'&&!button.disabled)");
    await click('Сбросить пароль');
    await passwords('synthetic-proxy-password', 'synthetic-assigned-password');
    await until("!document.querySelector('[role=dialog]')");
    assert.equal(responses.filter((response) => response.path.endsWith('/reset-password')).at(-1).status, 200);
    assert.equal(await evaluate('location.pathname'), '/users');
    console.log('PASS real password browser: ' + label + ' manager reauthentication, reset and retained manager access');

    await logout();
    await login('browser-password-worker-' + label, 'synthetic-assigned-password', '/tasks');
    assert.equal(await evaluate("document.body.innerText.includes('Рекомендуем сменить пароль')"), true);
    const retired = await evaluate("fetch('/api/auth/recPass',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(response=>response.status)");
    assert.equal(retired, 410);
    assert.deepEqual(errors, []);
    await logout();
    console.log('PASS real password browser: ' + label + ' reset password login, renewed recommendation and recovery 410');
} finally { socket.close(); }
