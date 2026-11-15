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
const responseStatuses = [];
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
    } else if (message.method === 'Network.responseReceived' && message.params.response.url.startsWith(origin + '/api/')) {
        responseStatuses.push({ path: new URL(message.params.response.url).pathname, status: message.params.response.status });
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
    const employeeName = `Browser employee ${Date.now()}`;
    await evaluate("document.querySelector('button.addUser').click()");
    await until("Boolean(document.querySelector('input[placeholder=\"Введите имя сотрудника\"]'))");
    await fill('Введите имя сотрудника', employeeName);
    await fill('Введите фамилию сотрудника', 'Test');
    await fill('Введите телеграм id сотрудника', 'browser-created-' + Date.now());
    await fill('Введите пароль сотрудника', 'synthetic-created-password');
    await fill('Frontend, Backend, Дизайнер, Тестировщик и т.п.', 'Test');
    await evaluate("document.querySelector('[role=combobox]').click()");
    await until("document.querySelectorAll('[role=option]').length>0");
    const rolePoint = await evaluate("{const item=Array.from(document.querySelectorAll('[role=option]')).find(option=>option.textContent.includes('Работник'));const rect=item.getBoundingClientRect();({x:rect.x+rect.width/2,y:rect.y+rect.height/2})}");
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...rolePoint });
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...rolePoint });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...rolePoint });
    await until("!document.querySelector('[role=option]') && document.querySelector('[role=combobox]').textContent.includes('Работник')");
    await until("!document.body.innerText.includes('Проверка сессии')");
    await click('Добавить пользователя');
    await until(`Array.from(document.querySelectorAll('.rowUser')).some(row=>row.textContent.includes(${JSON.stringify(employeeName)}))`);
    await until("document.querySelector('input[placeholder=\"Введите имя сотрудника\"]').value===''");
    assert.equal(await evaluate("document.querySelector('[role=combobox]').textContent.includes('Работник или менеджер')"), true);
    await evaluate("document.querySelector('[role=dialog]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
    await until("!document.querySelector('[role=dialog]')");
    await evaluate(`Array.from(document.querySelectorAll('.rowUser')).find(row=>row.textContent.includes(${JSON.stringify(employeeName)})).querySelector('img').click()`);
    await until("document.body.innerText.includes('Меню сотрудника')");
    await click('Удалить сотрудника');
    await until(`!document.querySelector('[role=dialog]') && !Array.from(document.querySelectorAll('.rowUser')).some(row=>row.textContent.includes(${JSON.stringify(employeeName)}))`);
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
    const oldToken = await evaluate("decodeURIComponent(document.cookie.split('; ').find(value => value.startsWith('token=')).slice(6))");
    await evaluate("document.querySelector('.item_auth img[alt=Выход]').click()");
    await until("location.pathname==='/login' && document.body.innerText.includes('Все сессии завершены')");
    const replayStatus = await evaluate(`fetch('/api/auth/protected', { headers: { Authorization: ${JSON.stringify('Bearer ' + oldToken)} } }).then(response => response.status)`);
    assert.equal(replayStatus, 401);
    assert.ok(requests.some((url) => url.endsWith('/api/auth/createUser')));
    assert.ok(requests.some((url) => url.endsWith('/api/auth/logout')));
    assert.ok(requests.some((url) => url.endsWith('/api/auth/login')));
    assert.ok(requests.some((url) => url.endsWith('/api/teams/create')));
    assert.ok(requests.every((url) => url.startsWith(origin + '/api/')), 'All API calls must use the frontend origin');
    assert.deepEqual(exceptions, []);
    console.log(`PASS real browser: ${login}, UI login, employee create/list/delete, verified session, team create/delete, logout and revoked JWT, same-origin API`);
} catch (error) {
    const state = await evaluate("({path:location.pathname,role:document.querySelector('[role=combobox]')?.textContent,inputs:Array.from(document.querySelectorAll('[role=dialog] input')).map(input=>({placeholder:input.placeholder,length:input.value.length,disabled:input.disabled})),messages:Array.from(document.querySelectorAll('[data-sonner-toast]')).map(toast=>toast.textContent)})").catch(() => null);
    console.error('Browser state:', JSON.stringify(state));
    console.error('Auth API statuses:', JSON.stringify(responseStatuses.filter(item => item.path.startsWith('/api/auth/'))));
    console.error('Recent API statuses:', JSON.stringify(responseStatuses.slice(-5)));
    throw error;
} finally { socket.close(); }
