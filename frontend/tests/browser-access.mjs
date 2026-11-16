// Run with Node >=22 against a dedicated headless Chrome and the test static server.
// Every request to the existing API is intercepted before the network; no real backend is used.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

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
let sessionValue = null;
let loginSequence = 0;
const revoked = new Set();
const proofFor = value => ({sessionId:createHash('sha256').update(value || 'anonymous').digest('hex').slice(0,32),csrfToken:'b'.repeat(64)});
let holdLogout = false;
let logoutStatus = 200;
const pendingLogouts = [];
let holdSession = false;
let pendingSessions = [];
let holdLogin = false;
let usersEnabled = false;
let holdUsers = false;
let usersStatus = 200;
let createStatus = 201;
const pendingUsers = [];
let employees = [];
let holdCreate = false;
let pendingLogins = [];
let pendingCreates = [];
let expectedPassword;
let teamsEnabled = false;
let holdTeam = false;
let failTeam = false;
let failMembers = false;
let showTask = false;
const pendingTeams = [];
let syntheticTeams = [];
const teamMembers = new Map();
const syntheticUsers = [
    { id: 3, fname: 'Member', lname: 'One', post: 'Test' },
    { id: 4, fname: 'Member', lname: 'Two', post: 'Test' },
];
const actor = () => ({ id: mode === 'manager' || mode === 'management403' ? 1 : 2,
    role: mode === 'manager' || mode === 'management403' ? 1 : 2,
    fname: 'Synthetic', lname: 'Test', tg_id: 'synthetic-test', post: 'Test' });
const headers = [
    ['Content-Type', 'application/json'], ['Access-Control-Allow-Origin', origin],
    ['Access-Control-Allow-Credentials', 'true'], ['Access-Control-Allow-Headers', 'content-type,authorization'],
    ['Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS'], ['Cache-Control', 'no-store']
].map(([name, value]) => ({ name, value }));
async function respond(event, status, data) {
    const responseHeaders = [...headers];
    const path = new URL(event.request.url).pathname;
    if (path === '/api/auth/protected' && status === 200) data = {...data,...proofFor(event.sessionValue)};
    if (path === '/api/auth/login' && status === 200) {
        sessionValue = 'synthetic-login-' + (++loginSequence);
        responseHeaders.push({name:'Set-Cookie',value:'dailysync_session='+sessionValue+'; Path=/api; HttpOnly; SameSite=Lax'});
        data = {user:actor()};
    }
    if (path === '/api/auth/logout' && status === 200) revoked.add(event.sessionValue);
    await call('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: status, responseHeaders,
        body: status === 204 ? '' : Buffer.from(JSON.stringify(data)).toString('base64') });
}
function createResponse(event) {
    const body = JSON.parse(event.request.postData);
    const user = { id: 1000 + employees.length, fname: body.fname, lname: body.lname,
        tg_id: body.tg_id, post: body.post, role: body.role };
    employees.push(user);
    return { message: 'Пользователь успешно зарегистрирован', user };
}
async function finishCreate(event) {
    if (createStatus === 201) return respond(event, 201, createResponse(event));
    const message = createStatus === 409 ? 'Пользователь с таким id уже существует.' : 'Ошибка сервера';
    return respond(event, createStatus, { message });
}
async function intercept(event) {
    const path = new URL(event.request.url).pathname;
    event.sessionValue = sessionValue;
    if (event.request.method === 'OPTIONS') return respond(event, 204, null);
    const body = event.request.postData ? JSON.parse(event.request.postData) : {};
    const password = body.password ?? body.pass ?? body.textNewPassword;
    records.push({ path, method: event.request.method, usersId: body.usersId, role: body.role, hasBearer: /^Bearer /.test(event.request.headers.Authorization || event.request.headers.authorization || ''),
        passwordChars: typeof password === 'string' ? password.length : undefined });
    if (!path.startsWith('/api/auth/') && (!sessionValue || revoked.has(sessionValue))) return respond(event,401,{message:'Expired'});
    if (expectedPassword !== undefined && password !== undefined) assert.equal(password, expectedPassword);
    if (path === '/api/auth/protected') {
        if (!sessionValue || revoked.has(sessionValue)) return respond(event,401,{message:'Anonymous'});
        if (holdSession) { pendingSessions.push(event); return; }
        if (mode === 'expired') return respond(event, 401, { message: 'Недействительная сессия' });
        if (mode === 'unavailable') return respond(event, 500, { message: 'Ошибка сервера' });
        return respond(event, 200, { user: actor() });
    }
    if (path === '/api/auth/logout') {
        if (holdLogout) { pendingLogouts.push(event); return; }
        return respond(event, logoutStatus, { success: logoutStatus === 200 });
    }
    if (path === '/api/auth/login') {
        if (holdLogin) { pendingLogins.push(event); return; }
        return respond(event, 200, { user: { ...actor(), token: 'synthetic-session' } });
    }
    if (path === '/api/auth/createUser') {
        if (holdCreate) { pendingCreates.push(event); return; }
        return finishCreate(event);
    }
    if (path === '/api/auth/recPass') return respond(event, 200, { recoverPassword: { questions: 'Synthetic question?' } });
    if (path === '/api/auth/recAns') return respond(event, 200, { recoveryToken: 'a'.repeat(64), expiresIn: 300 });
    if (path === '/api/auth/recPass/newPass') return respond(event, 200, { success: true });
    if (mode === 'task401' && path.endsWith('/tasks')) return respond(event, 401, { message: 'Недействительная сессия' });
    if (mode === 'management403' && path === '/api/users') return respond(event, 403, { message: 'Доступ запрещён' });
    if (usersEnabled && path.startsWith('/api/auth/delUser/')) {
        employees = employees.filter(user => user.id !== Number(path.split('/').at(-1)));
        return respond(event, 201, { message: 'Пользователь успешно удалён' });
    }
    if (usersEnabled && path === '/api/users') {
        if (holdUsers) { pendingUsers.push(event); return; }
        if (usersStatus !== 200) return respond(event, usersStatus, { message: 'Ошибка сервера' });
        return respond(event, 200, employees);
    }
    if (usersEnabled && /^\/api\/users\/\d+\/(team|vacation)$/.test(path)) {
        return respond(event, 201, { user: 'Отсутствует' });
    }
    if (teamsEnabled) {
        if (path === '/api/users') return respond(event, 200, syntheticUsers);
        if (path === '/api/teams/') return respond(event, 200, syntheticTeams);
        if (path === '/api/teams/create' || path.startsWith('/api/teams/edit/')) {
            if (holdTeam) await new Promise((release) => pendingTeams.push(release));
            if (failTeam) return respond(event, 500, { message: 'Synthetic team failure' });
            const id = path.endsWith('/create') ? 10 + syntheticTeams.length : Number(path.split('/').at(-1));
            const team = { id, name_team: body.nameTeam ?? body.newNameTeam, description_team: body.descriptionTeam };
            syntheticTeams = [...syntheticTeams.filter((item) => item.id !== id), team];
            const members = [...(teamMembers.get(id) || []), ...syntheticUsers.filter((user) => body.usersId.includes(user.id))];
            teamMembers.set(id, [...new Map(members.map((member) => [member.id, member])).values()]);
            return respond(event, 200, path.endsWith('/create') ? { task: { id } } : { edit: team });
        }
        if (path.startsWith('/api/teams/view/')) {
            if (failMembers) return respond(event, 500, { message: 'Synthetic loading failure' });
            return respond(event, 200, { view: teamMembers.get(Number(path.split('/').at(-1))) || [] });
        }
    }
    if (path === '/api/users') return respond(event, 200, []);
    if (path.endsWith('/tasks')) {
        const tasks = showTask ? [{ id: 77, content: 'Synthetic draft task', end_date: '2099-01-01' }] : [];
        return respond(event, 201, { user: tasks });
    }
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
const cookie = async (name,value) => {
    if (name==='token') {
        sessionValue=value;
        revoked.delete(value);
        await evaluate("localStorage.removeItem('dailysync.session-event')");
        return call('Network.setCookie',{name:'dailysync_session',value,url:origin,path:'/api',httpOnly:true,sameSite:'Lax'});
    }
    return call('Network.setCookie',{name,value,url:origin,path:'/'});
};
const clearCookies = async () => {sessionValue=null; await call('Network.clearBrowserCookies');};
const hasToken = () => evaluate("!localStorage.getItem('dailysync.session-event')?.startsWith('out:')");
const clickButton = (text) => evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === ${JSON.stringify(text)}).click()`);
const fill = (placeholder, value) => evaluate(`{
    const input = document.querySelector('input[placeholder='+${JSON.stringify(JSON.stringify(placeholder))}+']');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});
    input.dispatchEvent(new Event('input',{bubbles:true}));
}`);
async function chooseUserRole(label) {
    await evaluate("document.querySelector('[role=dialog] [role=combobox]').click()");
    await until(() => evaluate("document.querySelectorAll('[role=option]').length > 0"));
    const point = await evaluate(`{const option=Array.from(document.querySelectorAll('[role=option]')).find(item=>item.textContent.includes(${JSON.stringify(label)}));const rect=option.getBoundingClientRect();({x:rect.x+rect.width/2,y:rect.y+rect.height/2})}`);
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
    await until(() => evaluate(`!document.querySelector('[role=option]') && document.querySelector('[role=combobox]').textContent.includes(${JSON.stringify(label)})`));
}
let passed = 0;
function pass(name) { console.log(`PASS browser: ${name}`); passed++; }
try {
    await call('Page.enable');
    await call('Runtime.enable');
    await call('Network.enable');
    await call('Network.setBlockedURLs', { urls: ['https://*'] });
    await call('Fetch.enable', { patterns: [{ urlPattern: `${origin}/api/*`, requestStage: 'Request' }] });

    await clearCookies();
    await navigate('/tasks');
    await until(() => evaluate("location.pathname === '/login'"));
    assert.equal(records.filter(record=>record.path!=='/api/auth/protected').length, 0);
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
    assert.ok(records.filter((entry) => entry.path === '/api/auth/protected').every((entry) => !entry.hasBearer));
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
    await until(() => hasText('Недостаточно прав или требуется повторная проверка сессии'));
    assert.equal(await hasToken(), true);
    assert.equal(await evaluate('location.pathname'), '/users');
    pass('403 shows an access error and preserves session');

    mode = 'expired';
    await navigate('/tasks');
    await until(() => evaluate("location.pathname === '/login'"));
    assert.equal(await hasToken(), false);
    pass('expired session is rejected during initial verification');

    expectedPassword = '  Длинный🔐'.repeat(180) + ' tail ';
    await until(() => hasText('Войти'));
    await fill('Логин', 'synthetic-test');
    await fill('Пароль', expectedPassword);
    holdLogin = true;
    const previousLogins = records.filter((entry) => entry.path === '/api/auth/login').length;
    await evaluate("{ const button = Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Войти'); button.click(); button.click(); }");
    await until(async () => pendingLogins.length > 0);
    assert.equal(await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Вход…').disabled"), true);
    assert.equal(records.filter((entry) => entry.path === '/api/auth/login').length, previousLogins + 1);
    holdLogin = false;
    for (const event of pendingLogins) await respond(event, 429, { message: 'Слишком много попыток входа. Повторите позже.' });
    pendingLogins = [];
    await until(() => hasText('Слишком много попыток входа'));
    await until(() => hasText('Войти'));
    assert.equal(records.filter((entry) => entry.path === '/api/auth/login').at(-1).passwordChars, expectedPassword.length);
    pass('long login password is intact, double submit is blocked and 429 is visible');

    await evaluate("Array.from(document.querySelectorAll('p')).find(p => p.textContent === 'Восстановление пароля').click()");
    await fill('Введите логин', 'synthetic-test');
    await clickButton('Восстановить');
    await until(() => hasText('Проверочный вопрос'));
    await fill('Ответ', 'synthetic-answer');
    await clickButton('Подтвердить');
    await until(() => hasText('Сбросить пароль'));
    assert.equal(await evaluate("document.querySelector('input[placeholder=\"Новый пароль\"]').maxLength"), -1);
    await fill('Новый пароль', expectedPassword);
    await fill('Подтверждение пароля', expectedPassword);
    await clickButton('Сбросить пароль');
    await until(() => hasText('Войти'));
    assert.equal(records.filter((entry) => entry.path === '/api/auth/recPass/newPass').at(-1).passwordChars, expectedPassword.length);
    pass('recovery transmits a full password longer than 1024 characters without a length rule');

    mode = 'manager';
    await cookie('token', 'synthetic-session');
    await navigate('/users');
    await until(() => evaluate("Boolean(document.querySelector('button.addUser'))"));
    await evaluate("document.querySelector('button.addUser').click()");
    await until(() => hasText('Добавить пользователя'));
    await fill('Введите имя сотрудника', 'Synthetic');
    await fill('Введите фамилию сотрудника', 'Test');
    await fill('Введите телеграм id сотрудника', 'synthetic-new-user');
    await fill('Введите пароль сотрудника', expectedPassword);
    await fill('Frontend, Backend, Дизайнер, Тестировщик и т.п.', 'Test');
    await chooseUserRole('Работник');
    holdCreate = true;
    await evaluate("{ const button = Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Добавить пользователя'); button.click(); button.click(); }");
    await until(async () => pendingCreates.length > 0);
    assert.equal(pendingCreates.length, 1);
    assert.equal(await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Сохранение…').disabled"), true);
    holdCreate = false;
    for (const event of pendingCreates) await finishCreate(event);
    pendingCreates = [];
    await until(() => hasText('Добавить пользователя'));
    assert.equal(records.filter((entry) => entry.path === '/api/auth/createUser').at(-1).passwordChars, expectedPassword.length);
    assert.equal(records.filter(entry => entry.path === '/api/auth/createUser').at(-1).role, 2);
    pass('manager form keeps the long password and blocks concurrent creation requests');
    expectedPassword = undefined;
    teamsEnabled = true;
    await navigate('/teams');
    await until(() => evaluate("Boolean(document.querySelector('button.addTeam'))"));
    await evaluate("document.querySelector('button.addTeam').click()");
    await until(() => hasText('Создание команды'));
    await fill('Название', 'Browser team');
    await fill('Введите описание', 'Synthetic description');
    const chooseMember = async (name) => {
        await clickButton('Добавить');
        await until(() => evaluate(`Array.from(document.querySelectorAll('[cmdk-item]')).some(item => item.textContent.includes(${JSON.stringify(name)}))`));
        await evaluate(`Array.from(document.querySelectorAll('[cmdk-item]')).find(item => item.textContent.includes(${JSON.stringify(name)})).click()`);
        await evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
        await until(() => evaluate("!document.querySelector('[cmdk-item]')"));
    };
    await chooseMember('Member One');
    holdTeam = true;
    const beforeCreation = records.filter((record) => record.path === '/api/teams/create').length;
    await evaluate("{ const button=Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Сохранить'); button.click(); button.click(); }");
    await until(async () => pendingTeams.length === 1);
    assert.equal(records.filter((record) => record.path === '/api/teams/create').length, beforeCreation + 1);
    assert.deepEqual(records.filter((record) => record.path === '/api/teams/create').at(-1).usersId, [3]);
    assert.equal(await evaluate("Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Сохранение…').disabled"), true);
    assert.equal(await evaluate("document.querySelector('input[placeholder=Название]').disabled"), true);
    assert.equal(await evaluate("document.querySelector('input[placeholder=\"Введите описание\"]').disabled"), true);
    holdTeam = false;
    pendingTeams.splice(0).forEach((release) => release());
    await until(() => evaluate("!document.querySelector('[role=dialog]') && document.body.innerText.includes('Browser team')"));
    assert.equal(records.some((record) => record.path.startsWith('/api/teams/newUserTeam/')), false);
    pass('team and members are created in one request; double submit is blocked');

    const openTeam = async () => {
        await evaluate("document.querySelector('img.adaptArrow').click()");
        await until(() => hasText('Меню команды'));
        await until(() => evaluate("Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Сохранить'&&!button.disabled)"));
    };
    const closeDialog = async () => {
        await evaluate("document.querySelector('[role=dialog]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
        await until(() => evaluate("!document.querySelector('[role=dialog]')"));
    };
    await openTeam();
    await clickButton('Добавить');
    await until(() => evaluate("Boolean(document.querySelector('[cmdk-item]'))"));
    assert.equal(await evaluate("Array.from(document.querySelectorAll('[cmdk-item]')).some(item=>item.textContent.includes('Member One'))"), false);
    await evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
    await until(() => evaluate("!document.querySelector('[cmdk-item]')"));
    await chooseMember('Member Two');
    holdTeam = true;
    await evaluate("{const button=Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Сохранить');button.click();button.click();}");
    await until(async () => pendingTeams.length === 1);
    holdTeam = false;
    pendingTeams.splice(0).forEach((release) => release());
    await until(() => evaluate("document.querySelectorAll('[role=dialog] ol li').length === 2 && Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Сохранить'&&!button.disabled)"));
    const edits = () => records.filter((record) => record.path === '/api/teams/edit/10');
    assert.equal(edits().length, 1);
    assert.deepEqual(edits()[0].usersId, [4]);
    await clickButton('Сохранить');
    await until(async () => edits().length === 2);
    assert.deepEqual(edits()[1].usersId, []);
    await until(() => evaluate("Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Сохранить'&&!button.disabled)"));
    pass('existing members are excluded, saved members refresh and selection resets');

    await closeDialog();
    teamMembers.set(10, [syntheticUsers[0]]);
    await openTeam();
    assert.equal(await evaluate("document.querySelectorAll('[role=dialog] ol li').length"), 1);
    await closeDialog();
    pass('reopening the team reloads its current membership');

    failMembers = true;
    await evaluate("document.querySelector('img.adaptArrow').click()");
    await until(() => hasText('Не удалось загрузить состав команды'));
    assert.equal(await evaluate("Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Сохранить').disabled"), true);
    failMembers = false;
    await clickButton('Повторить');
    await until(() => evaluate("Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Сохранить'&&!button.disabled)"));
    await closeDialog();
    pass('membership load error blocks saving and supports retry');

    await evaluate("document.querySelector('button.addTeam').click()");
    await until(() => hasText('Создание команды'));
    assert.equal(await evaluate("document.querySelector('input[placeholder=Название]').value"), '');
    assert.equal(await evaluate("document.querySelectorAll('[role=dialog] ol li').length"), 0);
    await fill('Название', 'Failed team');
    failTeam = true;
    await clickButton('Сохранить');
    await until(() => hasText('Ошибка при сохранении данных команды'));
    await until(() => evaluate("Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Сохранить'&&!button.disabled)"));
    assert.equal(await evaluate("document.querySelector('input[placeholder=Название]').value"), 'Failed team');
    assert.equal(syntheticTeams.length, 1);
    failTeam = false;
    await closeDialog();
    pass('successful creation clears the form; failed creation keeps the draft and shows an error');

    const fillSelector = (selector, value) => evaluate(`{
        const input = document.querySelector(${JSON.stringify(selector)});
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }`);
    const beginSessionCheck = async () => {
        holdSession = true;
        await evaluate("window.dispatchEvent(new Event('focus'))");
        await until(async () => pendingSessions.length > 0);
    };
    const finishSessionCheck = async (status, data) => {
        holdSession = false;
        const events = pendingSessions.splice(0);
        for (const event of events) await respond(event, status, data);
    };

    if (!process.argv.includes('--only-team-regression')) {
        await evaluate("document.querySelector('button.addTeam').click()");
        await until(() => hasText('Создание команды'));
        await fill('Название', 'Unsaved focus draft');
        await beginSessionCheck();
        assert.equal(await evaluate("document.querySelector('input[placeholder=Название]')?.value"), 'Unsaved focus draft', 'Фоновая проверка не должна размонтировать форму');
        const writesBeforeCheck = records.filter((record) => record.path === '/api/teams/create').length;
        await clickButton('Сохранить');
        await until(() => evaluate("Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Сохранить'&&!button.disabled)"));
        assert.equal(records.filter((record) => record.path === '/api/teams/create').length, writesBeforeCheck);
        await finishSessionCheck(200, { user: actor() });
        await until(async () => !(await hasText('Проверка сессии')));
        assert.equal(await evaluate("document.querySelector('input[placeholder=Название]')?.value"), 'Unsaved focus draft');
        await closeDialog();
        pass('focus verification preserves an unsaved dialog and blocks writes until success');

        await evaluate("document.querySelector('button.addTeam').click()");
        await until(() => hasText('Создание команды'));
        await fill('Название', 'Temporary failure draft');
        await beginSessionCheck();
        await finishSessionCheck(500, { message: 'Synthetic temporary failure' });
        await until(() => hasText('Не удалось проверить сессию'));
        assert.equal(await evaluate("document.querySelector('input[placeholder=Название]')?.value"), 'Temporary failure draft');
        const writesBeforeFailure = records.filter((record) => record.path === '/api/teams/create').length;
        await clickButton('Сохранить');
        await until(() => evaluate("Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Сохранить'&&!button.disabled)"));
        assert.equal(records.filter((record) => record.path === '/api/teams/create').length, writesBeforeFailure);
        holdSession = true;
        const retryPoint = await evaluate(`{
            const button = Array.from(document.querySelectorAll('[role=dialog] button')).find(button => button.textContent === 'Повторить проверку сессии');
            const rect = button.getBoundingClientRect();
            ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
        }`);
        await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...retryPoint });
        await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...retryPoint });
        await until(async () => pendingSessions.length > 0);
        await finishSessionCheck(200, { user: actor() });
        await until(async () => !(await hasText('Проверка сессии')) && !(await hasText('Не удалось проверить сессию')));
        assert.equal(await evaluate("document.querySelector('input[placeholder=Название]')?.value"), 'Temporary failure draft');
        await closeDialog();
        pass('temporary background failure preserves the draft, blocks writes and supports retry');

        await evaluate("document.querySelector('button.addTeam').click()");
        await until(() => hasText('Создание команды'));
        await fill('Название', 'Expired cookie draft');
        const beforeExpiry = records.filter((record) => record.path === '/api/teams/create').length;
        await call('Network.deleteCookies', { name: 'dailysync_session', url: origin });
        sessionValue=null;
        await clickButton('Сохранить');
        await until(() => evaluate("location.pathname==='/login'"));
        assert.equal(records.filter((record) => record.path === '/api/teams/create').length, beforeExpiry+1);
        // HttpOnly-cookie недоступна JS; сервер отклоняет отправленный запрос до записи.
        await cookie('token', 'synthetic-session');
        pass('cookie expiry during editing receives 401 and closes the local session');

        const drafts = [
            { mode: 'manager', path: '/users', trigger: 'button.addUser', placeholder: 'Введите имя сотрудника' },
            { mode: 'worker', path: '/tasks', trigger: '.rowUserTask img.arrowAnim', placeholder: 'Отчёт о выполнении задачи' },
            { mode: 'manager', path: '/tasks_list', trigger: '.rowUserTask img.arrowAnim', placeholder: 'Напишите задачу' },
            { mode: 'manager', path: '/vacation_list', trigger: 'button.addVacationButt', placeholder: 'Начните вводить ФИО' },
        ];
        showTask = true;
        for (const draft of drafts) {
            mode = draft.mode;
            await navigate(draft.path);
            await until(() => evaluate(`Boolean(document.querySelector(${JSON.stringify(draft.trigger)}))`));
            await evaluate(`document.querySelector(${JSON.stringify(draft.trigger)}).click()`);
            await until(() => evaluate(`Boolean(document.querySelector('input[placeholder='+${JSON.stringify(JSON.stringify(draft.placeholder))}+']'))`));
            await fill(draft.placeholder, 'Synthetic preserved draft');
            await beginSessionCheck();
            const selector = `input[placeholder=${JSON.stringify(draft.placeholder)}]`;
            assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)})?.value`), 'Synthetic preserved draft');
            await finishSessionCheck(200, { user: actor() });
            await until(async () => !(await hasText('Проверка сессии')));
            assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)})?.value`), 'Synthetic preserved draft');
            await closeDialog();
            pass(`focus preserves draft on ${draft.path}`);
        }
        showTask = false;

        mode = 'manager';
        await navigate('/teams');
        await until(() => evaluate("Boolean(document.querySelector('button.addTeam'))"));
        await beginSessionCheck();
        await finishSessionCheck(200, { user: { ...actor(), role: 2 } });
        await until(() => hasText('Недостаточно прав для этой страницы'));
        assert.equal(await evaluate("Boolean(document.querySelector('button.addTeam'))"), false);
        pass('background role downgrade closes the management page');

        for (const status of [401, 403]) {
            await cookie('token', 'synthetic-session');
            await navigate('/teams');
            await until(() => evaluate("Boolean(document.querySelector('button.addTeam'))"));
            await beginSessionCheck();
            await finishSessionCheck(status, { message: 'Synthetic denied session' });
            if (status === 401) {
                await until(() => evaluate("location.pathname==='/login'"));
                assert.equal(await hasToken(), false);
            } else {
                await until(() => hasText('Доступ запрещён'));
            }
            assert.equal(await evaluate("Boolean(document.querySelector('button.addTeam'))"), false);
            pass(`background ${status} closes protected data`);
        }

        for (const oldStatus of [200, 401]) {
            mode = 'manager';
            await cookie('token', 'synthetic-old');
            await navigate('/teams');
            await until(() => evaluate("Boolean(document.querySelector('button.addTeam'))"));
            await evaluate("document.querySelector('button.addTeam').click()");
            await until(() => hasText('Создание команды'));
            await fill('Название', 'Old identity draft');
            await beginSessionCheck();
            const oldEvents = pendingSessions.splice(0);
            await cookie('token', 'synthetic-new');
            await evaluate("window.dispatchEvent(new StorageEvent('storage',{key:'dailysync.session-event',newValue:'in:changed'}))");
            mode = 'worker';
            await evaluate("window.dispatchEvent(new Event('focus'))");
            await until(async () => pendingSessions.length > 0);
            assert.equal(await evaluate("Boolean(document.querySelector('[role=dialog]'))"), false);
            await finishSessionCheck(200, { user: actor() });
            await until(() => hasText('Недостаточно прав для этой страницы'));
            for (const event of oldEvents) await respond(event, oldStatus, { user: { ...actor(), id: 1, role: 1 } });
            await evaluate('new Promise(resolve => setTimeout(resolve, 100))');
            assert.equal(await hasToken(), true);
            assert.equal(await hasText('Недостаточно прав для этой страницы'), true);
            assert.equal(await evaluate("Boolean(document.querySelector('[role=dialog]'))"), false);
            pass(`new identity discards old drafts and ignores late old ${oldStatus}`);
        }

        mode = 'manager';
        await cookie('token', 'synthetic-session');
        await navigate('/teams');
        await until(() => evaluate("Boolean(document.querySelector('button.addTeam'))"));
        await beginSessionCheck();
        await evaluate("document.querySelector('.item_auth img[alt=Выход]').click()");
        await until(() => evaluate("location.pathname==='/login'"));
        await finishSessionCheck(200, { user: actor() });
        await evaluate('new Promise(resolve => setTimeout(resolve, 100))');
        assert.equal(await hasToken(), false);
        assert.equal(await evaluate('location.pathname'), '/login');
        pass('late background success cannot restore a logged-out session');
        await cookie('token', 'synthetic-session');
        await navigate('/teams');
        await until(() => evaluate("Boolean(document.querySelector('button.addTeam'))"));
    }

    if (!process.argv.includes('--only-session-regression')) {
        failMembers = true;
        await evaluate("document.querySelector('img.adaptArrow').click()");
        await until(() => hasText('Не удалось загрузить состав команды'));
        await fillSelector('[role=dialog] input#name', 'Unsaved retry name');
        await fillSelector('[role=dialog] input#username', 'Unsaved retry description');
        failMembers = false;
        await clickButton('Повторить');
        await until(() => evaluate("Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Сохранить'&&!button.disabled)"));
        assert.equal(await evaluate("document.querySelector('[role=dialog] input#name').value"), 'Unsaved retry name', 'Повтор загрузки состава не должен сбрасывать название');
        assert.equal(await evaluate("document.querySelector('[role=dialog] input#username').value"), 'Unsaved retry description');
        await chooseMember('Member Two');
        await beginSessionCheck();
        assert.equal(await evaluate("document.querySelector('[role=dialog] input#name')?.value"), 'Unsaved retry name');
        await finishSessionCheck(200, { user: actor() });
        await until(async () => !(await hasText('Проверка сессии')));
        assert.equal(await evaluate("document.querySelectorAll('[role=dialog] ol li').length"), 2);
        pass('team edit fields and selected members survive focus verification');

        holdTeam = true;
        failTeam = true;
        await clickButton('Сохранить');
        await until(async () => pendingTeams.length === 1);
        assert.equal(await evaluate("document.querySelector('[role=dialog] input#name').disabled"), true);
        assert.equal(await evaluate("document.querySelector('[role=dialog] input#username').disabled"), true);
        holdTeam = false;
        pendingTeams.splice(0).forEach((release) => release());
        await until(() => evaluate("Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Сохранить'&&!button.disabled)"));
        assert.equal(await evaluate("document.querySelector('[role=dialog] input#name').value"), 'Unsaved retry name');
        assert.equal(await evaluate("document.querySelectorAll('[role=dialog] ol li').length"), 2);
        failTeam = false;
        await clickButton('Сохранить');
        await until(() => evaluate("Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Сохранить'&&!button.disabled)"));
        assert.equal(await evaluate("document.querySelectorAll('[role=dialog] ol li').length"), 2);
        assert.equal(await evaluate("document.querySelector('[role=dialog] input#name').value"), 'Unsaved retry name');
        await closeDialog();
        pass('membership retry preserves unsaved team fields');
        await openTeam();
        assert.equal(await evaluate("document.querySelector('[role=dialog] input#name').value"), 'Unsaved retry name');
        assert.equal(await evaluate("document.querySelectorAll('[role=dialog] ol li').length"), 2);
        await closeDialog();
        pass('failed edit preserves selection; successful retry clears it and reopening loads saved data');
    }
    // Серверный выход проверяем отдельно от локального завершения по 401.
    mode = 'manager';
    holdSession = false;
    for (const resultStatus of [200, 401, 500]) {
        logoutStatus = resultStatus;
        await cookie('token', 'synthetic-logout');
        await navigate('/teams');
        await until(() => evaluate("Boolean(document.querySelector('.item_auth img[alt=Выход]'))"));
        const count = records.filter(item => item.path === '/api/auth/logout').length;
        await evaluate("document.querySelector('.item_auth img[alt=Выход]').click()");
        await until(() => evaluate("location.pathname==='/login'"));
        await until(async () => records.filter(item => item.path === '/api/auth/logout').length === count + 1);
        const outgoing = records.filter(item => item.path === '/api/auth/logout').at(-1);
        assert.equal(outgoing.method, 'POST');
        assert.equal(outgoing.hasBearer, false);
        assert.equal(await hasToken(), false);
        const message = resultStatus === 500 ? 'Серверный отзыв сессий не подтверждён' : (resultStatus === 401 ? 'Сессия уже завершена' : 'Все сессии завершены');
        await until(() => hasText(message));
        pass(`logout ${resultStatus}: cookie/CSRF, local cleanup and accurate result`);
    }
    logoutStatus = 200;
    holdLogout = true;
    await cookie('token', 'synthetic-old-logout');
    await navigate('/teams');
    await until(() => evaluate("Boolean(document.querySelector('.item_auth img[alt=Выход]'))"));
    await evaluate("document.querySelector('.item_auth img[alt=Выход]').click()");
    await until(async () => pendingLogouts.length === 1);
    await until(() => evaluate("location.pathname==='/login'"));
    await cookie('token', 'synthetic-new-session');
    await navigate('/teams');
    await until(() => evaluate("Boolean(document.querySelector('.item_auth img[alt=Выход]'))"));
    holdLogout = false;
    await respond(pendingLogouts.shift(), 200, { success: true });
    await evaluate('new Promise(resolve => setTimeout(resolve, 100))');
    assert.equal(await hasToken(), true);
    assert.equal(await evaluate('location.pathname'), '/teams');
    pass('late logout response preserves a newer local session');
    const logoutCount = records.filter(item => item.path === '/api/auth/logout').length;
    mode = 'expired';
    await cookie('token', 'synthetic-expired');
    await navigate('/tasks');
    await until(() => evaluate("location.pathname==='/login'"));
    assert.equal(await hasToken(), false);
    assert.equal(records.filter(item => item.path === '/api/auth/logout').length, logoutCount);
    pass('automatic 401 cleanup does not recursively call server logout');
    // Сотрудники: проверяем реальные эффекты React и гонку загрузки списка.
    mode = 'manager';
    usersEnabled = true;
    employees = [];
    holdUsers = true;
    await cookie('token', 'synthetic-users-session');
    await navigate('/users');
    await until(() => evaluate("Boolean(document.querySelector('button.addUser'))"));
    await until(async () => pendingUsers.length > 0);
    const oldUserLoads = pendingUsers.splice(0);
    await evaluate("document.querySelector('button.addUser').click()");
    await until(() => hasText('Добавить пользователя'));
    const countCreates = () => records.filter(item => item.path === '/api/auth/createUser').length;
    const inputValue = (placeholder) => evaluate(`document.querySelector('input[placeholder='+${JSON.stringify(JSON.stringify(placeholder))}+']').value`);
    const fillEmployee = async (name, account) => {
        await fill('Введите имя сотрудника', name);
        await fill('Введите фамилию сотрудника', 'Test');
        await fill('Введите телеграм id сотрудника', account);
        await fill('Введите пароль сотрудника', 'synthetic-create-password');
        await fill('Frontend, Backend, Дизайнер, Тестировщик и т.п.', 'Test');
    };
    const beforeInvalid = countCreates();
    await fill('Введите пароль сотрудника', 'synthetic-create-password');
    await clickButton('Добавить пользователя');
    await until(() => hasText('Заполните имя, фамилию и должность'));
    await fillEmployee('Employee One', 'synthetic-employee-one');
    await clickButton('Добавить пользователя');
    await until(() => hasText('Выберите роль: менеджер или работник'));
    await chooseUserRole('Работник');
    await fill('Введите имя сотрудника', '😀'.repeat(256));
    await clickButton('Добавить пользователя');
    await evaluate('new Promise(resolve => setTimeout(resolve, 100))');
    assert.equal(countCreates(), beforeInvalid);
    pass('employee form rejects missing fields, missing role and overlong Unicode without POST');

    await fill('Введите имя сотрудника', 'Employee One');
    holdCreate = true;
    createStatus = 409;
    await evaluate("{const button=Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Добавить пользователя');button.click();button.click();}");
    await until(async () => pendingCreates.length === 1);
    assert.equal(countCreates(), beforeInvalid + 1);
    assert.equal(await evaluate("Array.from(document.querySelectorAll('[role=dialog] input')).every(input=>input.disabled)"), true);
    assert.equal(await evaluate("document.querySelector('[role=dialog] [role=combobox]').disabled"), true);
    pass('employee save blocks all inputs and duplicate submission');
    holdCreate = false;
    await finishCreate(pendingCreates.shift());
    await until(() => evaluate("Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Добавить пользователя'&&!button.disabled)"));
    assert.equal(await inputValue('Введите имя сотрудника'), 'Employee One');
    assert.equal(await inputValue('Введите пароль сотрудника'), 'synthetic-create-password');
    assert.equal(await evaluate("document.querySelector('[role=combobox]').textContent.includes('Работник')"), true);
    await until(() => hasText('Пользователь с таким id уже существует.'));
    pass('409 preserves the employee draft, password and selected role');

    createStatus = 201;
    await clickButton('Добавить пользователя');
    await until(() => evaluate("document.querySelectorAll('.rowUser').length===1"));
    await until(async () => pendingUsers.length > 0);
    for (const event of oldUserLoads) await respond(event, 200, []);
    await evaluate('new Promise(resolve => setTimeout(resolve, 100))');
    assert.equal(await evaluate("document.querySelectorAll('.rowUser').length"), 1);
    assert.equal(await inputValue('Введите имя сотрудника'), '');
    assert.equal(await inputValue('Введите пароль сотрудника'), '');
    assert.equal(await evaluate("document.querySelector('[role=combobox]').textContent.includes('Работник или менеджер')"), true);
    holdUsers = false;
    for (const event of pendingUsers.splice(0)) await respond(event, 200, employees);
    pass('created employee appears immediately; late old GET cannot remove it; fields and role reset');

    await fillEmployee('Employee Two', 'synthetic-employee-two');
    await chooseUserRole('Менеджер');
    usersStatus = 500;
    await clickButton('Добавить пользователя');
    await until(() => evaluate("document.querySelectorAll('.rowUser').length===2"));
    await until(() => hasText('Не удалось обновить список сотрудников'));
    await closeDialog();
    const beforeRetry = countCreates();
    const beforeReload = records.filter(item=>item.path==='/api/users').length;
    usersStatus = 200;
    await clickButton('Повторить');
    await until(async () => records.filter(item=>item.path==='/api/users').length > beforeReload);
    await until(async () => !await hasText('Не удалось обновить список сотрудников'));
    assert.equal(await evaluate("document.querySelectorAll('.rowUser').length"), 2);
    assert.equal(countCreates(), beforeRetry);
    pass('failed list refresh retains committed employee; retry reads without repeating creation');

    await evaluate("document.querySelector('button.addUser').click()");
    await until(() => hasText('Добавить пользователя'));
    await fillEmployee('Employee Three', 'synthetic-employee-three');
    await chooseUserRole('Работник');
    createStatus = 500;
    await clickButton('Добавить пользователя');
    await until(async () => countCreates() === beforeRetry + 1);
    await until(() => evaluate("Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Добавить пользователя'&&!button.disabled)"));
    assert.equal(await inputValue('Введите имя сотрудника'), 'Employee Three');
    assert.equal(await inputValue('Введите телеграм id сотрудника'), 'synthetic-employee-three');
    assert.equal(await evaluate("document.querySelectorAll('.rowUser').length"), 2);
    assert.equal(employees.length, 2);
    await closeDialog();
    pass('500 creation failure preserves draft and leaves the employee list unchanged');
    createStatus = 201;
    holdUsers = true;
    await evaluate("document.querySelector('button.addUser').click()");
    await until(() => hasText('Добавить пользователя'));
    await fillEmployee('Employee Four', 'synthetic-employee-four');
    await chooseUserRole('Работник');
    await clickButton('Добавить пользователя');
    await until(() => evaluate("document.querySelectorAll('.rowUser').length===3"));
    await until(async () => pendingUsers.length > 0);
    const staleEmployees = [...employees];
    const oldRefresh = pendingUsers.splice(0);
    await closeDialog();
    await evaluate("Array.from(document.querySelectorAll('.rowUser')).find(row=>row.textContent.includes('Employee Four')).querySelector('img').click()");
    await until(() => hasText('Меню сотрудника'));
    await clickButton('Удалить сотрудника');
    await until(() => evaluate("document.querySelectorAll('.rowUser').length===2 && !document.querySelector('[role=dialog]')"));
    holdUsers = false;
    for (const event of oldRefresh) await respond(event, 200, staleEmployees);
    await evaluate('new Promise(resolve => setTimeout(resolve, 100))');
    assert.equal(await evaluate("document.querySelectorAll('.rowUser').length"), 2);
    assert.equal(await evaluate("Array.from(document.querySelectorAll('.rowUser')).some(row=>row.textContent.includes('Employee Four'))"), false);
    pass('late post-creation list refresh cannot resurrect a deleted employee');
    assert.deepEqual(interceptionErrors, []);
    assert.deepEqual(exceptions, []);
    console.log(`Browser scenarios passed: ${passed}; API responses are synthetic, no working backend contacted`);
} catch (error) {
    const state = await evaluate("({path:location.pathname,role:document.querySelector('[role=combobox]')?.textContent,inputs:Array.from(document.querySelectorAll('[role=dialog] input')).map(input=>({placeholder:input.placeholder,length:input.value.length,disabled:input.disabled}))})").catch(() => null);
    console.error('Browser state:', JSON.stringify(state));
    console.error('Recent API paths:', records.slice(-5).map(record => record.method + ' ' + record.path).join(', '));
    throw error;
} finally {
    if (process.argv.includes('--close-browser')) {
        await new Promise((resolve) => {
            const timeout = setTimeout(() => { socket.close(); resolve(); }, 3000);
            socket.addEventListener('close', () => { clearTimeout(timeout); resolve(); }, { once: true });
            socket.send(JSON.stringify({ id: ++nextId, method: 'Browser.close' }));
        });
    } else socket.close();
}
