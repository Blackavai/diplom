// Только отдельный Chrome и тестовая статика. Все API-запросы перехватываются до сети.
import assert from 'node:assert/strict';

const [debugPort, origin] = process.argv.slice(2);
assert.match(debugPort || '', /^\d+$/);
assert.match(origin || '', /^http:\/\/127\.0\.0\.1:\d+$/);
const targets = await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json();
const socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
});
let nextId = 0;
const calls = new Map();
const errors = [];
const records = [];
const exceptions = [];
let userId = 2;
let rows = [];
let listStatus = 200;
let holdLists = false;
const pendingLists = [];
const pendingReports = [];
function call(method, params = {}) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { calls.delete(id); reject(new Error('CDP timeout: ' + method)); }, 10000);
        calls.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
    });
}
async function respond(event, status, body) {
    await call('Fetch.fulfillRequest', {
        requestId: event.requestId, responseCode: status,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Cache-Control', value: 'no-store' }],
        body: Buffer.from(JSON.stringify(body)).toString('base64')
    });
}
async function intercept(event) {
    const path = new URL(event.request.url).pathname;
    const body = event.request.postData ? JSON.parse(event.request.postData) : undefined;
    records.push({ path, method: event.request.method, body, bearer: event.request.headers.Authorization || event.request.headers.authorization });
    if (path === '/api/auth/protected') {
        return respond(event, 200, { user: { id: userId, role: 2, fname: 'Reports', lname: 'Test', tg_id: 'synthetic-reports', post: 'Test' } });
    }
    if (path === '/api/users/' + userId + '/tasks') {
        if (holdLists) { pendingLists.push(event); return; }
        return respond(event, listStatus, listStatus === 200 ? { user: rows } : { message: 'Ошибка сервера' });
    }
    if (path === '/api/reports/new') { pendingReports.push(event); return; }
    return respond(event, 404, { message: 'Synthetic test route not found' });
}
socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
        const entry = calls.get(message.id);
        if (!entry) return;
        clearTimeout(entry.timer);
        calls.delete(message.id);
        if (message.error) entry.reject(new Error(message.error.message));
        else entry.resolve(message.result);
    } else if (message.method === 'Fetch.requestPaused') {
        intercept(message.params).catch(error => errors.push(error.message));
    } else if (message.method === 'Runtime.exceptionThrown') {
        exceptions.push(message.params.exceptionDetails.text);
    }
});
async function evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
}
async function until(predicate, timeout = 10000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        try { if (await predicate()) return; } catch { /* Навигация меняет контекст. */ }
        await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Browser reports assertion timeout');
}
const hasText = text => evaluate('document.body.innerText.includes(' + JSON.stringify(text) + ')');
const countRows = () => evaluate("document.querySelectorAll('.rowUserTask').length");
const countPosts = () => records.filter(record => record.path === '/api/reports/new').length;
const countGets = () => records.filter(record => /\/tasks$/.test(record.path)).length;
const click = label => evaluate('Array.from(document.querySelectorAll("button")).find(button=>button.textContent===' + JSON.stringify(label) + ').click()');
const inputValue = () => evaluate('document.querySelector("input[placeholder=\'Отчёт о выполнении задачи\']").value');
async function fill(value) {
    await evaluate('{const input=document.querySelector("input[placeholder=\'Отчёт о выполнении задачи\']");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,' + JSON.stringify(value) + ');input.dispatchEvent(new Event("input",{bubbles:true}));}');
}
async function openTask(id) {
    await evaluate('Array.from(document.querySelectorAll(".rowUserTask")).find(row=>row.textContent.includes("Synthetic report task ' + id + '")).querySelector("img.arrowAnim").click()');
    await until(() => hasText('Меню задач'));
    await until(async () => !(await hasText('Проверка сессии')));
}
const task = id => ({ id, content: 'Synthetic report task ' + id, end_date: '2099-01-01' });
const navigate = () => call('Page.navigate', { url: origin + '/tasks' });
async function completeReport(status) {
    const event = pendingReports.shift();
    const body = JSON.parse(event.request.postData);
    if (status === 200) rows = rows.filter(row => row.id !== body.id_task);
    await respond(event, status, { message: status === 200 ? 'Отчёт успешно отправлен' : 'Synthetic report failure' });
}
let passed = 0;
function pass(name) { passed++; console.log('PASS reports browser: ' + name); }

try {
    await call('Page.enable');
    await call('Runtime.enable');
    await call('Network.enable');
    await call('Network.setBlockedURLs', { urls: ['https://*'] });
    await call('Fetch.enable', { patterns: [{ urlPattern: origin + '/api/*', requestStage: 'Request' }] });
    await call('Network.clearBrowserCookies');
    await call('Network.setCookie', { name: 'token', value: 'synthetic-reports-session', url: origin, path: '/' });
    holdLists = true;
    await navigate();
    await until(() => pendingLists.length > 0);
    assert.equal(await hasText('Загрузка задач…'), true);
    assert.equal(await hasText('Задач нет'), false);
    holdLists = false;
    for (const event of pendingLists.splice(0)) await respond(event, 500, { message: 'Ошибка сервера' });
    await until(() => hasText('Не удалось обновить список задач'));
    assert.equal(await hasText('Задач нет'), false);
    pass('loading and failed initial GET never masquerade as an empty list');

    rows = [task(77), task(78)];
    await click('Повторить');
    await until(async () => (await countRows()) === 2);
    assert.equal(await hasText('Не удалось обновить список задач'), false);
    pass('list retry loads tasks with the verified user Bearer');

    await openTask(77);
    const beforeInvalid = countPosts();
    for (const value of ['   ', '😀'.repeat(256), 'x\0y', '\ud800']) {
        await fill(value);
        await click('Отправить отчёт');
        await until(() => hasText('Введите текст отчёта от 1 до 255 символов'));
    }
    assert.equal(countPosts(), beforeInvalid);
    pass('invalid report text is rejected without sending POST');

    await fill('  Synthetic preserved report  ');
    await evaluate('{const button=Array.from(document.querySelectorAll("button")).find(button=>button.textContent==="Отправить отчёт");button.click();button.click();}');
    await until(() => pendingReports.length === 1);
    assert.equal(countPosts(), beforeInvalid + 1);
    assert.equal(await evaluate('document.querySelector("input[placeholder=\'Отчёт о выполнении задачи\']").disabled'), true);
    assert.equal(await evaluate('Array.from(document.querySelectorAll("button")).find(button=>button.textContent==="Отправка…").disabled'), true);
    const sent = records.filter(record => record.path === '/api/reports/new').at(-1);
    assert.equal(sent.body.text_report, '  Synthetic preserved report  ');
    assert.equal(sent.body.id_task, 77);
    assert.equal(sent.body.id_user, undefined);
    assert.match(sent.body.end_date, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(sent.bearer, /^Bearer /);
    pass('double click sends one request and locks report editing');

    const beforeFailureGets = countGets();
    for (const status of [500, 400]) {
        if (status === 400) {
            await click('Отправить отчёт');
            await until(() => pendingReports.length === 1);
        }
        await completeReport(status);
        await until(() => hasText('Synthetic report failure'));
        assert.equal(await inputValue(), '  Synthetic preserved report  ');
        assert.equal(await countRows(), 2);
        assert.equal(countGets(), beforeFailureGets);
    }
    pass('400 and 500 preserve the draft and task without a misleading refresh');

    holdLists = true;
    await click('Отправить отчёт');
    await until(() => pendingReports.length === 1);
    await completeReport(200);
    await until(async () => (await countRows()) === 1 && pendingLists.length > 0);
    assert.equal(await evaluate('Boolean(document.querySelector("[role=dialog]"))'), false);
    const staleLists = pendingLists.splice(0);
    await openTask(78);
    await fill('Second synthetic report');
    await click('Отправить отчёт');
    await until(() => pendingReports.length === 1);
    await completeReport(200);
    await until(async () => (await countRows()) === 0 && pendingLists.length > 0);
    for (const event of staleLists) await respond(event, 200, { user: [task(78)] });
    await evaluate('new Promise(resolve=>setTimeout(resolve,100))');
    assert.equal(await countRows(), 0);
    pass('confirmed reports disappear immediately; an older GET cannot resurrect a completed task');

    holdLists = false;
    for (const event of pendingLists.splice(0)) await respond(event, 500, { message: 'Ошибка сервера' });
    await until(() => hasText('Не удалось обновить список задач'));
    const committedPostCount = countPosts();
    await click('Повторить');
    await until(() => hasText('Задач нет'));
    assert.equal(countPosts(), committedPostCount);
    pass('failed post-report reload keeps completion and retries only GET');

    rows = [task(79)];
    await navigate();
    await until(async () => (await countRows()) === 1);
    await openTask(79);
    await fill('Synthetic timeout draft');
    await click('Отправить отчёт');
    await until(() => pendingReports.length === 1);
    // Настоящий timeout Axios: ответ удерживается дольше 15 секунд.
    await until(() => hasText('Результат отправки не подтверждён'), 22000);
    pendingReports.splice(0);
    const timeoutPosts = countPosts();
    assert.equal(await inputValue(), 'Synthetic timeout draft');
    assert.equal(await evaluate('Array.from(document.querySelectorAll("button")).find(button=>button.textContent==="Отправить отчёт").disabled'), true);
    await click('Отправить отчёт');
    assert.equal(countPosts(), timeoutPosts);
    pass('actual POST timeout preserves the draft and blocks blind resubmission');

    listStatus = 500;
    await click('Обновить список задач');
    await until(() => hasText('Не удалось обновить список задач'));
    assert.equal(await inputValue(), 'Synthetic timeout draft');
    assert.equal(await evaluate('Array.from(document.querySelectorAll("button")).find(button=>button.textContent==="Отправить отчёт").disabled'), true);
    assert.equal(countPosts(), timeoutPosts);
    listStatus = 200;
    rows = [];
    await click('Обновить список задач');
    await until(() => hasText('Задач нет'));
    assert.equal(countPosts(), timeoutPosts);
    pass('uncertain result refresh tolerates failure and reconciles a committed report without POST');

    rows = [task(80)];
    await navigate();
    await until(async () => (await countRows()) === 1);
    await openTask(80);
    await fill('Synthetic disconnected draft');
    await click('Отправить отчёт');
    await until(() => pendingReports.length === 1);
    await call('Fetch.failRequest', { requestId: pendingReports.shift().requestId, errorReason: 'ConnectionReset' });
    await until(() => hasText('Результат отправки не подтверждён'));
    assert.equal(await inputValue(), 'Synthetic disconnected draft');
    pass('network failure reports uncertainty instead of claiming a rollback');

    holdLists = true;
    await navigate();
    await until(() => pendingLists.length > 0);
    await until(() => hasText('Не удалось обновить список задач'), 22000);
    pendingLists.splice(0);
    holdLists = false;
    assert.equal(await hasText('Задач нет'), false);
    rows = [task(81)];
    await click('Повторить');
    await until(async () => (await countRows()) === 1);
    pass('actual GET timeout shows an error and permits a safe read retry');

    await openTask(81);
    await fill('Old user draft');
    await click('Отправить отчёт');
    await until(() => pendingReports.length === 1);
    const oldReport = pendingReports.shift();
    userId = 3;
    rows = [task(83)];
    await call('Network.setCookie', { name: 'token', value: 'synthetic-reports-next-user', url: origin, path: '/' });
    await evaluate('window.dispatchEvent(new Event("focus"))');
    await until(() => hasText('Synthetic report task 83'));
    assert.equal(await evaluate('Boolean(document.querySelector("[role=dialog]"))'), false);
    await respond(oldReport, 200, { message: 'Отчёт успешно отправлен' });
    await evaluate('new Promise(resolve=>setTimeout(resolve,100))');
    assert.equal(await countRows(), 1);
    assert.equal(await hasText('Synthetic report task 83'), true);
    assert.equal(await hasText('Old user draft'), false);
    pass('late report response cannot update the next user page or preserve the old draft');

    holdLists = true;
    await navigate();
    await until(() => pendingLists.length > 0);
    const previousUserLists = pendingLists.splice(0);
    userId = 4;
    rows = [task(84)];
    holdLists = false;
    await call('Network.setCookie', { name: 'token', value: 'synthetic-reports-fourth-user', url: origin, path: '/' });
    await evaluate('window.dispatchEvent(new Event("focus"))');
    await until(() => hasText('Synthetic report task 84'));
    for (const event of previousUserLists) await respond(event, 200, { user: [task(83)] });
    await evaluate('new Promise(resolve=>setTimeout(resolve,100))');
    assert.equal(await hasText('Synthetic report task 84'), true);
    assert.equal(await hasText('Synthetic report task 83'), false);
    pass('late task list response cannot mix data between verified users');

    assert.ok(records.filter(record => record.path.endsWith('/tasks')).every(record => /^Bearer /.test(record.bearer)));
    assert.deepEqual(errors, []);
    assert.deepEqual(exceptions, []);
    console.log('Browser report scenarios passed: ' + passed + '; synthetic API only');
} finally {
    if (process.argv.includes('--close-browser')) {
        await call('Browser.close').catch(() => {});
    }
    socket.close();
}
