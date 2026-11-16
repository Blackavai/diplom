// Только выделенный Chrome и тестовая статика. Все API-запросы перехватываются до сети.
import assert from 'node:assert/strict';
const [port,origin]=process.argv.slice(2);
assert.match(port||'',/^\d+$/);assert.match(origin||'',/^http:\/\/127\.0\.0\.1:\d+$/);
const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const socket=new WebSocket(targets.find(target=>target.type==='page').webSocketDebuggerUrl);
await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
let nextId=0;const calls=new Map();const errors=[];const records=[];const held=[];
let employees=[{id:2,fname:'Alpha',lname:'Test',tg_id:'alpha',post:'Test'},{id:3,fname:'Beta',lname:'Test',tg_id:'beta',post:'Test'}];
const tasks={2:[{id:201,content:'Existing task',end_date:'2099-01-01'}],3:[]};
let vacations=[];
let reports=[{id:301,fname:'Alpha',lname:'Test',content:'Report task',text_report:'Synthetic text',end_date:'2026-11-16',check_report:false}];
const statuses={employees:200,details:200,vacations:200,reports:200,teams:200};
let holdEmployees=false;
const counts=path=>records.filter(record=>record.path===path).length;
function call(method,params={}){const id=++nextId;return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{calls.delete(id);reject(new Error('CDP timeout: '+method));},10000);
    calls.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
});}
async function respond(event,status,data){await call('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:status,
    responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Cache-Control',value:'no-store'}],body:Buffer.from(JSON.stringify(data)).toString('base64')});}
async function intercept(event){
    const path=new URL(event.request.url).pathname;const method=event.request.method;
    const body=event.request.postData?JSON.parse(event.request.postData):undefined;
    records.push({path,method,body});
    if(path==='/api/auth/protected')return respond(event,200,{user:{id:1,role:1,fname:'Manager',lname:'Test',tg_id:'manager',post:'Test'},sessionId:'a'.repeat(32),csrfToken:'b'.repeat(64)});
    if(path==='/api/users'&&method==='GET'){
        if(holdEmployees){held.push(event);return;}
        return respond(event,statuses.employees,statuses.employees===200?employees:{message:'Synthetic load failure'});
    }
    if(/\/api\/users\/\d+\/tasks$/.test(path))return respond(event,statuses.details,statuses.details===200?{user:tasks[path.split('/')[3]]||[]}:{message:'Synthetic details failure'});
    if(/\/api\/users\/\d+\/(team|vacation)$/.test(path))return respond(event,statuses.details,statuses.details===200?{user:'Отсутствует'}:{message:'Synthetic details failure'});
    if(path==='/api/users/vacation/view')return respond(event,statuses.vacations,statuses.vacations===200?{user:vacations}:{message:'Synthetic vacation failure'});
    if(path==='/api/reports'&&method==='GET')return respond(event,statuses.reports,statuses.reports===200?reports:{message:'Synthetic report failure'});
    if((path==='/api/teams/'||path==='/api/teams')&&method==='GET')return respond(event,statuses.teams,statuses.teams===200?[]:{message:'Synthetic team failure'});
    if(method!=='GET'){held.push(event);return;}
    return respond(event,404,{message:'Synthetic unknown route'});
}
socket.addEventListener('message',({data})=>{
    const event=JSON.parse(data);
    if(event.id){const pending=calls.get(event.id);if(!pending)return;clearTimeout(pending.timer);calls.delete(event.id);if(event.error)pending.reject(new Error(event.error.message));else pending.resolve(event.result);}
    else if(event.method==='Fetch.requestPaused')intercept(event.params).catch(error=>errors.push(error.message));
    else if(event.method==='Runtime.exceptionThrown')errors.push(event.params.exceptionDetails.text);
});
async function evaluate(expression){const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text);return result.result.value;}
async function until(expression,timeout=10000){const deadline=Date.now()+timeout;while(Date.now()<deadline){try{if(await evaluate(expression))return;}catch{}await new Promise(resolve=>setTimeout(resolve,30));}throw new Error('Browser timeout: '+expression);}
const text=message=>`document.body.innerText.includes(${JSON.stringify(message)})`;
const click=label=>evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent===${JSON.stringify(label)}).click()`);
const fill=(placeholder,value)=>evaluate(`{const input=document.querySelector('input[placeholder='+${JSON.stringify(JSON.stringify(placeholder))}+']');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));}`);
async function navigate(path){await call('Page.navigate',{url:origin+path});}
async function waitHeld(path){const deadline=Date.now()+10000;while(Date.now()<deadline){const index=held.findIndex(event=>new URL(event.request.url).pathname===path);if(index>=0)return held.splice(index,1)[0];await new Promise(resolve=>setTimeout(resolve,25));}throw new Error('No held request: '+path);}
async function chooseEmployee(name){
    await evaluate("document.querySelector('[role=dialog] button:has(svg.lucide-chevrons-up-down)').click()");
    await until("document.querySelectorAll('[cmdk-item]').length>0");
    await evaluate(`Array.from(document.querySelectorAll('[cmdk-item]')).find(item=>item.textContent.includes(${JSON.stringify(name)})).click()`);
    await until("!document.querySelector('[cmdk-item]')");
}
let passed=0;const pass=message=>{passed++;console.log('PASS forms: '+message);};
try{
    await call('Page.enable');await call('Runtime.enable');await call('Network.enable');
    await call('Network.setBlockedURLs',{urls:['https://*']});
    await call('Emulation.setTimezoneOverride',{timezoneId:'Europe/Moscow'});
    await call('Fetch.enable',{patterns:[{urlPattern:origin+'/api/*',requestStage:'Request'}]});
    await navigate('/login');await until("Boolean(document.querySelector('input[placeholder=Логин]'))");
    await evaluate("localStorage.removeItem('dailysync.session-event')");
    holdEmployees=true;await navigate('/tasks_list');
    const initial=await waitHeld('/api/users');
    assert.equal(await evaluate(text('Загрузка сотрудников…')),true);
    assert.equal(await evaluate("Boolean(document.querySelector('img[alt=\"Сотрудников нет\"]'))"),false);
    holdEmployees=false;await respond(initial,500,{message:'Synthetic failure'});
    await until(text('Не удалось загрузить сотрудников'));
    assert.equal(await evaluate("Boolean(document.querySelector('img[alt=\"Сотрудников нет\"]'))"),false);
    statuses.details=500;await click('Повторить');
    await until("document.querySelectorAll('.rowUserTask').length===2 && document.body.innerText.includes('Не удалось обновить данные сотрудника')");
    assert.equal(await evaluate("document.querySelectorAll('.badgeVacUser').length"),0);
    assert.equal(await evaluate("document.querySelector('.rowUserTask').innerText.includes('Задач: —')"),true);
    statuses.details=200;await evaluate("document.querySelectorAll('.rowUserTask button').forEach(button=>button.click())");
    await until("document.querySelector('.rowUserTask').innerText.includes('Задач: 1') && !document.body.innerText.includes('Не удалось обновить данные сотрудника')");
    pass('loading/error do not become an empty list, zero tasks or a false vacation badge; GET retry recovers');

    await evaluate("document.querySelector('.rowUserTask img.arrowAnim').click()");
    await until(text('Меню задач'));await fill('Напишите задачу','Client task');await fill('Срок задачи','2099-01-01');
    const beforeTask=counts('/api/tasks/new');
    await evaluate("{const button=Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Добавить задачу');button.click();button.click();}");
    const created=await waitHeld('/api/tasks/new');
    assert.equal(counts('/api/tasks/new'),beforeTask+1);
    assert.equal(await evaluate("Array.from(document.querySelectorAll('[role=dialog] input')).every(input=>input.disabled)"),true);
    const saved={id:452,content:'Server task',end_date:'2099-01-01'};tasks[2].push(saved);statuses.details=500;
    await respond(created,200,{message:'Saved',checkVacation:false,task:saved});
    await until("!document.querySelector('[role=dialog]') && document.body.innerText.includes('Не удалось обновить данные сотрудника')");
    assert.equal(await evaluate("document.querySelector('.rowUserTask').innerText.includes('Задач: 2')"),true);
    await evaluate("document.querySelector('.rowUserTask img.arrowAnim').click()");await until(text('Server task'));
    assert.equal(await evaluate("Array.from(document.querySelectorAll('[role=dialog] li')).some(item=>item.textContent==='Client task')"),false);
    statuses.details=200;await click('Повторить');await until("!document.body.innerText.includes('Не удалось обновить данные сотрудника')");
    assert.equal(counts('/api/tasks/new'),beforeTask+1);
    pass('one task POST locks fields, uses the actual server record and survives a failed read refresh');

    await fill('Напишите задачу','Timeout draft');await fill('Срок задачи','2099-01-02');await click('Добавить задачу');
    await waitHeld('/api/tasks/new');await until(text('Сервер мог сохранить задачу'),22000);
    const uncertainCount=counts('/api/tasks/new');await click('Добавить задачу');assert.equal(counts('/api/tasks/new'),uncertainCount);
    await click('Обновить список задач');await until("!document.body.innerText.includes('Сервер мог сохранить задачу')");
    assert.equal(await evaluate("document.querySelector('input[placeholder=\"Напишите задачу\"]').value"),'Timeout draft');
    assert.equal(counts('/api/tasks/new'),uncertainCount);
    pass('actual task timeout preserves the draft and reconciles by GET without automatic POST');

    statuses.vacations=500;await navigate('/vacation_list');await until(text('Не удалось обновить список отпусков'));
    assert.equal(await evaluate("Boolean(document.querySelector('img[alt=\"Отпусков нет\"]'))"),false);
    statuses.vacations=200;await click('Повторить');await until("Boolean(document.querySelector('img[alt=\"Отпусков нет\"]'))");
    await evaluate("document.querySelector('button.addVacationButt').click()");await until(text('Меню отпусков'));
    await until("!document.querySelector('[role=dialog] button:has(svg.lucide-chevrons-up-down)').disabled");
    await chooseEmployee('Alpha Test');await fill('Начните вводить ФИО','Beta Test');
    await fill('Начало отпуска','2099-02-01');await fill('Конец отпуска','2099-02-02');await click('Открыть отпуск');
    await until(text('Выберите сотрудника из списка'));
    assert.equal(records.some(record=>record.method==='POST'&&/\/users\/vacation\/\d+$/.test(record.path)),false);
    await chooseEmployee('Beta Test');
    await evaluate("{const button=Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Открыть отпуск');button.click();button.click();}");
    const vacation=await waitHeld('/api/users/vacation/3');
    assert.equal(records.filter(record=>record.path==='/api/users/vacation/3').length,1);
    assert.equal(await evaluate("Array.from(document.querySelectorAll('[role=dialog] input')).every(input=>input.disabled)"),true);
    await respond(vacation,400,{message:'Synthetic vacation rejection'});await until(text('Synthetic vacation rejection'));
    assert.equal(await evaluate("document.querySelector('input[placeholder=\"Начните вводить ФИО\"]').value"),'Beta Test');
    assert.ok(await evaluate("document.querySelector('input[placeholder=\"Начало отпуска\"]').value.length>0"));
    pass('editing the employee search clears the old ID; vacation submit locks controls and preserves a rejected draft');

    await click('Открыть отпуск');const retryVacation=await waitHeld('/api/users/vacation/3');
    vacations=[{fname:'Beta',lname:'Test',start_holiday:'2099-02-01',end_holiday:'2099-02-02'}];statuses.vacations=500;
    await respond(retryVacation,201,{message:'Saved',user:{id:501,id_user:'3',start_holiday:'2099-02-01',end_holiday:'2099-02-02'}});
    await until("!document.querySelector('[role=dialog]') && document.body.innerText.includes('Не удалось обновить список отпусков')");
    const vacationPosts=counts('/api/users/vacation/3');statuses.vacations=200;await click('Повторить');await until("document.querySelectorAll('.rowReport').length===1");
    assert.equal(counts('/api/users/vacation/3'),vacationPosts);
    pass('a committed vacation stays committed when reload fails; retry only reads');

    statuses.reports=500;await navigate('/reports_list');await until(text('Не удалось обновить список отчётов'));
    assert.equal(await evaluate("Boolean(document.querySelector('img[alt=\"Отчётов нет\"]'))"),false);
    statuses.reports=200;await click('Повторить');await until("document.querySelectorAll('.rowReport').length===1");
    await evaluate("document.querySelector('.rowReport img').click()");await until(text('Меню отчётов'));
    await evaluate("{const button=Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Отчёт прочитан');button.click();button.click();}");
    const acceptance=await waitHeld('/api/reports/accept/301');assert.equal(counts('/api/reports/accept/301'),1);
    await respond(acceptance,400,{message:'Synthetic acceptance failure'});await until(text('Synthetic acceptance failure'));
    assert.equal(await evaluate("Boolean(document.querySelector('[role=dialog]'))"),true);
    await click('Отчёт прочитан');const retryAcceptance=await waitHeld('/api/reports/accept/301');
    reports=reports.map(report=>({...report,check_report:true}));statuses.reports=500;
    await respond(retryAcceptance,200,{id:301,check_report:true});
    await until("!document.querySelector('[role=dialog]') && document.body.innerText.includes('Не удалось обновить список отчётов')");
    assert.equal(await evaluate("document.querySelectorAll('.rowReport').length"),0);
    const puts=counts('/api/reports/accept/301');statuses.reports=200;await click('Повторить');await until("!document.body.innerText.includes('Не удалось обновить список отчётов')");
    assert.equal(counts('/api/reports/accept/301'),puts);
    pass('acceptance is guarded, failure keeps the report, success updates the filter and read retry never repeats PUT');

    statuses.details=500;await navigate('/users');await until("document.querySelectorAll('.rowUser').length===2");
    await evaluate("document.querySelector('.rowUser img').click()");await until(text('Не удалось загрузить данные сотрудника'));
    assert.equal(await evaluate(text('Задач стоит: —')),true);
    statuses.details=200;await click('Повторить');await until("!document.querySelector('[role=dialog] button.btnInteractive').disabled");
    await evaluate("{const button=Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Удалить сотрудника');button.click();button.click();}");
    const deletion=await waitHeld('/api/auth/delUser/2');assert.equal(counts('/api/auth/delUser/2'),1);
    await respond(deletion,409,{message:'Связанные данные сохранены'});await until(text('Связанные данные сохранены'));
    assert.equal(await evaluate("document.querySelectorAll('.rowUser').length"),2);
    assert.equal(await evaluate("Boolean(document.querySelector('[role=dialog]'))"),true);
    pass('employee details retry and guarded deletion preserve the row/dialog on a dependency conflict');

    statuses.teams=500;await navigate('/teams');await until(text('Не удалось обновить список команд'));
    assert.equal(await evaluate("Boolean(document.querySelector('img[alt=\"Описание изображения\"]'))"),false);
    statuses.teams=200;await click('Повторить');await until("Boolean(document.querySelector('img[alt=\"Описание изображения\"]'))");
    pass('team network failure is distinct from an empty list and supports GET retry');
    assert.deepEqual(errors,[]);
    console.log('Browser form scenarios passed: '+passed+'; synthetic API only');
}catch(error){
    console.error('Browser form state:',await evaluate("({path:location.pathname,text:document.body.innerText.slice(-1000),inputs:Array.from(document.querySelectorAll('[role=dialog] input')).map(input=>({placeholder:input.placeholder,disabled:input.disabled}))})").catch(()=>null));
    throw error;
}finally{socket.close();}
