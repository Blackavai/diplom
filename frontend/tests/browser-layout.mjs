// Выделенный Chrome, синтетические данные: ни один API-запрос не достигает сети.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const [port, origin, mode] = process.argv.slice(2);
assert.match(port || '', /^\d+$/);
assert.match(origin || '', /^http:\/\/127\.0\.0\.1:\d+$/);
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let nextId = 0;
let role = 1;
const pending = new Map();
const errors = [];
const writes = [];
const longText = 'ДлинныйТекстБезПробелов'.repeat(10);
const employee = { id: 2, fname: longText, lname: 'Тест', tg_id: 'synthetic', post: longText };
const task = { id: 201, content: longText, end_date: '2099-01-01' };
const team = { id: 10, name_team: longText, description_team: longText };
function call(method, params = {}) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timeout')); }, 10000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
    });
}
async function respond(event, status, data) {
    await call('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: status,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(data)).toString('base64') });
}
async function intercept(event) {
    const path = new URL(event.request.url).pathname;
    if (event.request.method !== 'GET') { writes.push(path); return respond(event, 500, { message: 'Unexpected synthetic write' }); }
    if (path === '/api/auth/protected') return respond(event, 200, { user: { ...employee, id: 1, role }, sessionId: 'a'.repeat(32), csrfToken: 'b'.repeat(64) });
    if (path === '/api/users') return respond(event, 200, [employee, { ...employee, id: 3 }]);
    if (path === '/api/teams/') return respond(event, 200, [team]);
    if (path.startsWith('/api/teams/view/')) return respond(event, 200, { view: [employee] });
    if (path === '/api/tasks/1') return respond(event, 200, [task]);
    if (/\/users\/\d+\/tasks$/.test(path)) return respond(event, 200, { user: [task] });
    if (/\/users\/\d+\/team$/.test(path)) return respond(event, 200, { user: longText });
    if (/\/users\/\d+\/vacation$/.test(path)) return respond(event, 200, { user: 'Отсутствует' });
    if (path === '/api/users/vacation/view') return respond(event, 200, { user: [{ ...employee, id: 501, start_holiday: '2099-01-01', end_holiday: '2099-01-02' }, { ...employee, id: 502, start_holiday: '2099-02-01', end_holiday: '2099-02-02' }] });
    if (path === '/api/reports') return respond(event, 200, [{ ...employee, id: 301, content: longText, text_report: longText, end_date: '2099-01-01', check_report: false }]);
    return respond(event, 404, { message: 'Synthetic route not found' });
}
socket.addEventListener('message', ({ data }) => {
    const event = JSON.parse(data);
    if (event.id) {
        const entry = pending.get(event.id);
        if (!entry) return;
        clearTimeout(entry.timer); pending.delete(event.id);
        if (event.error) entry.reject(new Error(event.error.message)); else entry.resolve(event.result);
    } else if (event.method === 'Fetch.requestPaused') intercept(event.params).catch(error => errors.push(error.message));
    else if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.text);
});
async function evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
}
async function until(expression) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        if (await evaluate(expression).catch(() => false)) return;
        await new Promise(resolve => setTimeout(resolve, 40));
    }
    throw new Error('Browser timeout: ' + expression);
}
async function viewport(width, height) { await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); }
async function screenshot(name) {
    if (!process.env.LAYOUT_SCREENSHOT_DIR) return;
    const { data } = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(process.env.LAYOUT_SCREENSHOT_DIR, name + '.png'), Buffer.from(data, 'base64'));
}
async function navigate(path, selector) {
    await call('Page.navigate', { url: origin + path });
    await until(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    await evaluate('document.fonts.ready.then(()=>true)');
    if (mode !== '--baseline') assert.equal(await evaluate('document.documentElement.lang'), 'ru');
    await new Promise(resolve => setTimeout(resolve, 350));
}
async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); }
async function fill(placeholder, value) {
    await evaluate(`{const input=Array.from(document.querySelectorAll('input')).find(input=>input.placeholder===${JSON.stringify(placeholder)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));}`);
}
async function escape() { await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }); await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' }); }
const routes = [['/users', '.rowUser'], ['/teams', '.rowTeam'], ['/tasks_list', '.rowUserTask'], ['/reports_list', '.rowReport'], ['/vacation_list', '.rowReport'], ['/tasks', '.rowUserTask'], ['/login', '.loginMainBlock'], ['/missing', 'img[width="1000"]']];
let passed = 0;
function pass(message) { passed++; console.log('PASS layout: ' + message); }
try {
    await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
    await call('Network.setBlockedURLs', { urls: ['https://*'] });
    await call('Fetch.enable', { patterns: [{ urlPattern: origin + '/api/*', requestStage: 'Request' }] });
    for (const [width, height] of mode === '--components' ? [] : [[360, 740], [390, 844], [768, 1024], [1024, 768], [1280, 800], [1920, 1080], [640, 400]]) {
        await viewport(width, height);
        for (const [path, selector] of routes) {
            role = path === '/tasks' ? 2 : 1;
            await navigate(path, selector);
            const dimensions = await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})');
            if (mode === '--baseline') console.log('BASELINE', width, path, dimensions);
            else assert.ok(dimensions.scroll <= dimensions.width + 1, `${width} ${path}: ${JSON.stringify(dimensions)}`);
            if (mode !== '--baseline' && width > 1024) {
                const header = await evaluate("(()=>{const r=document.querySelector('.item_auth').getBoundingClientRect();return {left:r.left,right:r.right};})()");
                assert.ok(header.left >= 0 && header.right <= width + 1, 'header overlaps navigation: ' + JSON.stringify(header));
            }
            if (mode !== '--baseline' && width === 390 && path === '/users') await screenshot('users-mobile');
            if (mode !== '--baseline' && width === 1280 && path === '/reports_list') await screenshot('reports-desktop');
        }
        if (mode !== '--baseline') pass(`${width}x${height}: all existing pages fit with long data`);
    }
    if (mode === '--baseline') process.exitCode = 0;
    else {
        for (const [width, height] of mode === '--components' ? [] : [[360, 640], [768, 420], [1024, 768]]) {
            await viewport(width, height);
            for (const [path, selector, trigger] of [
                ['/users', '.rowUser', '.rowUser img'], ['/users', '.rowUser', '.addUser'],
                ['/teams', '.rowTeam', '.rowTeam img'], ['/teams', '.rowTeam', '.addTeam'],
                ['/tasks_list', '.rowUserTask', '.rowUserTask img'], ['/reports_list', '.rowReport', '.rowReport img'],
                ['/vacation_list', '.rowReport', '.addVacationButt'], ['/tasks', '.rowUserTask', '.rowUserTask img'],
            ]) {
                role = path === '/tasks' ? 2 : 1;
                await navigate(path, selector); await click(trigger); await until("Boolean(document.querySelector('[data-slot=dialog-content]'))");
                await new Promise(resolve => setTimeout(resolve, 300));
                const bounds = await evaluate(`(()=>{const d=document.querySelector('[data-slot=dialog-content]');const r=d.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,scroll:d.scrollWidth,client:d.clientWidth};})()`);
                assert.ok(bounds.left >= 0 && bounds.right <= width + 1 && bounds.top >= 0 && bounds.bottom <= height + 1, `${path}: ${JSON.stringify(bounds)}`);
                assert.ok(bounds.scroll <= bounds.client + 1, `${path}: dialog horizontal overflow`);
                if (width === 360 && trigger === '.addUser') await screenshot('create-user-mobile');
                await evaluate("{const d=document.querySelector('[data-slot=dialog-content]');d.scrollTop=d.scrollHeight;}");
                const footerVisible = await evaluate("(()=>{const b=document.querySelector('[data-slot=dialog-footer] button');if(!b)return true;const r=b.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})()");
                assert.equal(footerVisible, true, path + ': footer reachable');
                await escape(); await until("!document.querySelector('[data-slot=dialog-content]')");
                assert.equal(await evaluate("document.activeElement.matches('button[data-slot=dialog-trigger]')"), true, path + ': focus returns to trigger');
            }
            pass(`${width}x${height}: eight dialogs fit, scroll, close with Escape and restore focus`);
        }
        await viewport(390, 660); role = 1;
        await navigate('/vacation_list', '.rowReport'); await click('.addVacationButt');
        await until("Boolean(document.querySelector('input[placeholder=\"Начало отпуска\"]'))");
        await fill('Начало отпуска', '31.02.2028');
        assert.equal(await evaluate("document.querySelector('input[placeholder=\"Начало отпуска\"]').getAttribute('aria-invalid')"), 'true');
        await fill('Начало отпуска', '29.02.2028');
        assert.equal(await evaluate("document.querySelector('input[placeholder=\"Начало отпуска\"]').getAttribute('aria-invalid')"), 'false');
        await fill('Начало отпуска', '');
        assert.equal(await evaluate("document.querySelector('input[placeholder=\"Начало отпуска\"]').value"), '');
        await fill('Конец отпуска', '2028-03-01');
        const ids = await evaluate("Array.from(document.querySelectorAll('[role=dialog] [id]')).map(node=>node.id)");
        assert.equal(new Set(ids).size, ids.length);
        await click('button[aria-label="Открыть календарь: Начало отпуска"]');
        await until("Boolean(document.querySelector('[data-slot=popover-content]'))");
        await new Promise(resolve => setTimeout(resolve, 300));
        const calendar = await evaluate("(()=>{const r=document.querySelector('[data-slot=popover-content]').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};})()");
        assert.ok(calendar.left >= 0 && calendar.right <= 391 && calendar.top >= 0 && calendar.bottom <= 661, JSON.stringify(calendar));
        await click('[data-slot=popover-content] button[data-day]:not([disabled])');
        await until("!document.querySelector('[data-slot=popover-content]')");
        assert.match(await evaluate("document.querySelector('input[placeholder=\"Начало отпуска\"]').value"), /^\d{2}\.\d{2}\.\d{4}$/);
        await fill('Начало отпуска', '');
        await click('[role=dialog] button:has(svg.lucide-chevrons-up-down)');
        await until("document.querySelectorAll('[cmdk-item]').length>0");
        await click('[cmdk-item]');
        await evaluate("Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Открыть отпуск').click()");
        await until("document.body.innerText.includes('Выберите сотрудника из списка и даты отпуска')");
        assert.deepEqual(writes, []);
        await escape();
        pass('calendar: impossible day, leap day, ISO, clearing, unique IDs and constrained popup');

        await navigate('/tasks_list', '.rowUserTask'); await click('.rowUserTask img');
        await fill('Напишите задачу', 'Synthetic task'); await fill('Срок задачи', '2099-01-01');
        await fill('Срок задачи', '2099-01-');
        await evaluate("Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Добавить задачу').click()");
        await until("document.body.innerText.includes('Введите задачу от 1 до 255 символов')");
        assert.deepEqual(writes, []); await escape();
        pass('cleared vacation and partial task dates cannot send the previously selected day');

        await viewport(360, 420); await navigate('/teams', '.rowTeam'); await click('.addTeam');
        await until("Array.from(document.querySelectorAll('[role=dialog] button')).some(button=>button.textContent.includes('Добавить')&&!button.disabled)");
        await evaluate("Array.from(document.querySelectorAll('[role=dialog] button')).find(button=>button.textContent.includes('Добавить')).click()");
        await until("Boolean(document.querySelector('[data-slot=popover-content] [cmdk-item]'))");
        await new Promise(resolve => setTimeout(resolve, 300));
        const members = await evaluate("(()=>{const d=document.querySelector('[data-slot=popover-content]');const r=d.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,scroll:d.scrollWidth,client:d.clientWidth};})()");
        assert.ok(members.left >= 0 && members.right <= 361 && members.top >= 0 && members.bottom <= 421, JSON.stringify(members));
        assert.ok(members.scroll <= members.client + 1);
        await escape(); await escape();
        await navigate('/reports_list', '.rowReport');
        await click('[data-slot=select-trigger]'); await until("Boolean(document.querySelector('[data-slot=select-content]'))");
        await new Promise(resolve => setTimeout(resolve, 300));
        const dropdown = await evaluate("(()=>{const r=document.querySelector('[data-slot=select-content]').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};})()");
        assert.ok(dropdown.left >= 0 && dropdown.right <= 361 && dropdown.top >= 0 && dropdown.bottom <= 421, JSON.stringify(dropdown));
        await escape();
        pass('team member popup and report dropdown stay within a short mobile viewport');

        await navigate('/users', '.rowUser'); await click('button[aria-label="Открыть меню"]');
        await until("Boolean(document.querySelector('[role=dialog]'))");
        for (let index = 0; index < 10; index++) {
            await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab' });
            await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab' });
            assert.equal(await evaluate("document.querySelector('[role=dialog]').contains(document.activeElement)"), true);
        }
        await escape(); await until("!document.querySelector('[role=dialog]')");
        assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"), 'Открыть меню');
        pass('mobile navigation uses keyboard focus, Escape and focus restoration');

        // Эти общие компоненты не используются страницами; проверяем их отдельно в Vite.
        await evaluate(`(async()=>{
            const React=(await import('/node_modules/.vite/deps/react.js')).default;
            const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
            const {CommandDialog}=await import('/src/components/ui/command.tsx');
            const {Input}=await import('/src/components/ui/input.tsx');
            const host=document.createElement('div');document.body.append(host);
            window.layoutTestRoot=createRoot(host);window.layoutTestHost=host;
            window.renderLayoutFixture=showCloseButton=>window.layoutTestRoot.render(React.createElement(CommandDialog,{open:true,showCloseButton,title:'Synthetic command'},React.createElement(Input,{className:'custom-layout-input',placeholder:'Synthetic input'})));
            window.renderLayoutFixture(false);
        })()`);
        await until("Boolean(document.querySelector('input[placeholder=\"Synthetic input\"]'))");
        assert.equal(await evaluate("Boolean(document.querySelector('input.custom-layout-input'))"), true);
        assert.equal(await evaluate("Boolean(document.querySelector('[data-slot=dialog-content] button:has(span.sr-only)'))"), false);
        await evaluate('window.renderLayoutFixture(true)');
        await until("Boolean(document.querySelector('[data-slot=dialog-content] button span.sr-only'))");
        assert.equal(await evaluate("document.querySelector('[data-slot=dialog-content]').contains(document.getElementById(document.querySelector('[data-slot=dialog-content]').getAttribute('aria-labelledby')))"), true);
        await evaluate('window.layoutTestRoot.unmount();window.layoutTestHost.remove()');
        pass('shared Input className and CommandDialog title/optional close button work in the real DOM');
        await evaluate("(async()=>{const url=performance.getEntriesByType('resource').map(entry=>entry.name).find(url=>url.includes('/sonner.js?v='));const {toast}=await import(url);toast.error('Synthetic notification '+ 'ДлинныйТекстБезПробелов'.repeat(20));})()");
        await until("Boolean(document.querySelector('[data-sonner-toast]'))");
        await new Promise(resolve => setTimeout(resolve, 300));
        const notification = await evaluate("(()=>{const d=document.querySelector('[data-sonner-toast]');const r=d.getBoundingClientRect();return {left:r.left,right:r.right,scroll:d.scrollWidth,client:d.clientWidth};})()");
        assert.ok(notification.left >= 0 && notification.right <= 361 && notification.scroll <= notification.client + 1, JSON.stringify(notification));
        pass('long notification text wraps inside the mobile viewport');
        assert.deepEqual(errors, []); assert.deepEqual(writes, []);
        console.log(`Browser layout scenarios passed: ${passed}; synthetic API, no writes`);
    }
} catch (error) {
    console.error('Layout failure:', await evaluate(`({path:location.pathname,width:innerWidth,height:innerHeight,clientWidth:document.documentElement.clientWidth,visualWidth:visualViewport.width,visualHeight:visualViewport.height,popupStyle:document.querySelector('[data-radix-popper-content-wrapper]')?.getAttribute('style')})`).catch(() => null));
    await screenshot('failure');
    throw error;
} finally { socket.close(); }
