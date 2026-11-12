// Real browser -> frontend proxy -> backend smoke check, only for explicitly seeded test environments.
// Credentials here are synthetic fixtures, never credentials of the working database.
import assert from 'node:assert/strict';
const [port, origin, login] = process.argv.slice(2);
assert.match(port || '', /^\d+$/);
assert.match(origin || '', /^http:\/\/127\.0\.0\.1:\d+$/);
assert.ok(['host-proxy-manager', 'browser-proxy-manager'].includes(login));
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let id = 0;
const pending = new Map();
const requests = [];
const exceptions = [];
function call(method, params = {}) {
    const current = ++id;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(current); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
        pending.set(current, { resolve, reject, timer });
        socket.send(JSON.stringify({ id: current, method, params }));
    });
}
socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
        const operation = pending.get(message.id);
        if (!operation) return;
        clearTimeout(operation.timer);
        pending.delete(message.id);
        if (message.error) operation.reject(new Error(message.error.message)); else operation.resolve(message.result);
    } else if (message.method === 'Network.requestWillBeSent') {
        const url = message.params.request.url;
        if (/\/api\//.test(url)) requests.push(url);
    } else if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
});
const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.equal(result.exceptionDetails, undefined, 'Browser JavaScript must succeed');
    return result.result.value;
};
async function until(expression) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        try { if (await evaluate(expression)) return; } catch { /* navigation replaces context */ }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Browser timeout: ${expression}`);
}
const click = (label) => evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent===${JSON.stringify(label)}).click()`);
const fill = (placeholder, value) => evaluate(`{
    const input=document.querySelector('input[placeholder='+${JSON.stringify(JSON.stringify(placeholder))}+']');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});
    input.dispatchEvent(new Event('input',{bubbles:true}));
}`);
try {
    await call('Network.enable');
    await call('Page.enable');
    await call('Runtime.enable');
    await call('Network.setBlockedURLs', { urls: ['https://*'] });
    await call('Network.clearBrowserCookies');
    await call('Page.navigate', { url: origin + '/login' });
    await until("Boolean(document.querySelector('input[placeholder=Логин]'))");
    await fill('Логин', login);
    await fill('Пароль', 'synthetic-proxy-password');
    await click('Войти');
    await until("location.pathname==='/users' && Boolean(document.querySelector('button.addUser'))");
    await call('Page.navigate', { url: origin + '/teams' });
    await until("Boolean(document.querySelector('button.addTeam'))");
    await evaluate("document.querySelector('button.addTeam').click()");
    await until("document.body.innerText.includes('Создание команды')");
    const teamName = `Browser proxy ${Date.now()}`;
    await fill('Название', teamName);
    await fill('Введите описание', 'Synthetic proxy smoke');
    await click('Сохранить');
    await until(`!document.querySelector('[role=dialog]') && document.body.innerText.includes(${JSON.stringify(teamName)})`);
    await evaluate(`Array.from(document.querySelectorAll('.rowTeam')).find(row=>row.textContent.includes(${JSON.stringify(teamName)})).querySelector('img.adaptArrow').click()`);
    await until("document.body.innerText.includes('Меню команды')");
    await click('Удалить команду');
    await until(`!document.querySelector('[role=dialog]') && !document.body.innerText.includes(${JSON.stringify(teamName)})`);
    assert.ok(requests.some((url) => url.endsWith('/api/auth/login')));
    assert.ok(requests.some((url) => url.endsWith('/api/teams/create')));
    assert.ok(requests.every((url) => url.startsWith(origin + '/api/')), 'All API calls must use the frontend origin');
    assert.deepEqual(exceptions, []);
    console.log(`PASS real browser: ${login}, UI login, verified session, team create/delete, same-origin API`);
} finally { socket.close(); }
