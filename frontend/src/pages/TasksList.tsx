import '../style/user.css';
import '../style/task.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import arrow from '@/assets/right-arrow-upd.png';
import imgUsersNone from '@/assets/users_none.png';
import api, { apiErrorMessage, apiResponseMessage } from '@/lib/api';
import type { Employee, TaskSummary, VacationPeriod } from '@/lib/types';
import { Calendar28 } from './VacationList';
import { calendarDate, businessDate } from '@/lib/dates';
import { useNotification } from './notification-context';
import { useAuth } from './auth-context';

type DetailsStatus = 'loading' | 'ready' | 'error';
interface TaskResponse { message: string; checkVacation: boolean; task?: TaskSummary }
interface DialogTaskProps {
    user: Employee;
    tasks: TaskSummary[];
    status: DetailsStatus;
    onRefresh: () => Promise<boolean>;
    onCreated: (task: TaskSummary) => void;
}

export function DialogTask({ user, tasks, status, onRefresh, onCreated }: DialogTaskProps) {
    const [open, setOpen] = useState(false);
    const [dateTask, setDateTask] = useState('');
    const [taskContent, setTaskContent] = useState('');
    const [pending, setPending] = useState(false);
    const [uncertain, setUncertain] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const busy = useRef(false);
    const active = useRef(true);
    const { addNotification } = useNotification();
    const { sessionError, retrySession } = useAuth();
    useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

    async function handleSubmit() {
        if (busy.current || uncertain || status !== 'ready') return;
        if (!taskContent.trim() || Array.from(taskContent).length > 255 || taskContent.includes('\0') ||
            /[\uD800-\uDFFF]/u.test(taskContent) || !dateTask || dateTask < businessDate()) {
            setError('Введите задачу от 1 до 255 символов и срок не раньше сегодняшнего дня.');
            return;
        }
        busy.current = true;
        setPending(true);
        setError(null);
        try {
            const { data } = await api.post<TaskResponse>('/tasks/new', {
                content: taskContent, id_user: user.id, end_date: dateTask, start_date: businessDate()
            }, { timeout: 15000 });
            if (!active.current) return;
            if (data.checkVacation) { setError(data.message); return; }
            if (!data.task || !Number.isInteger(data.task.id) || data.task.id <= 0 || typeof data.task.content !== 'string' || typeof data.task.end_date !== 'string') {
                setUncertain(true);
                setError('Ответ создания не подтверждён. Обновите список и проверьте его перед повторной отправкой.');
                return;
            }
            // Сохраняем серверный id; перечитывание списка не повторяет POST.
            onCreated(data.task);
            setTaskContent('');
            setDateTask('');
            setOpen(false);
            addNotification('success', 'Задача успешно добавлена');
        } catch (failure: unknown) {
            if (!active.current) return;
            console.error('Ошибка создания задачи:', apiErrorMessage(failure));
            if (axios.isAxiosError(failure) && (!failure.response || failure.response.status >= 500)) {
                setUncertain(true);
                setError('Сервер мог сохранить задачу. Обновите список и проверьте его перед повторной отправкой.');
            } else setError(apiResponseMessage(failure, 'Не удалось добавить задачу. Проверьте сессию и повторите попытку.'));
        } finally {
            busy.current = false;
            if (active.current) setPending(false);
        }
    }
    async function refreshTasks() {
        const refreshed = await onRefresh();
        if (active.current && refreshed) { setUncertain(false); setError(null); }
    }

    return <Dialog open={open} onOpenChange={(value) => { if (!busy.current) setOpen(value); }}>
        <DialogTrigger asChild><img src={arrow} alt="arrow right" width="60px" className="box-shadow: 0 5px 10px rgba(0, 0, 0, 0.2) arrowAnim" /></DialogTrigger>
        <DialogContent className="sm:max-w-[40%] p-15">
            <DialogHeader><DialogTitle>Меню задач</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid-cols-1 items-center gap-4 hrTitle"><p>Сотрудник: {user.fname} {user.lname}</p></div>
                <div className="grid items-center gap-4">
                    <Label htmlFor="username" className="text-right">Предстоящие задачи:</Label>
                    {status === 'loading' && <p role="status">Загрузка задач…</p>}
                    {status === 'error' && <div role="alert">Не удалось обновить данные сотрудника. <button type="button" onClick={refreshTasks}>Повторить</button></div>}
                    <ol className="list-decimal liTeam">
                        {tasks.map((task) => <li key={task.id}>{task.content}</li>)}
                        {status === 'ready' && tasks.length === 0 && <li>Нет предстоящих задач</li>}
                    </ol>
                </div>
                <div className="grid items-center gap-4 hrTitle py-2">
                    <input id="name" type="text" placeholder="Напишите задачу" className="col-span-3 outlineFocus"
                        value={taskContent} disabled={pending || uncertain} onChange={(event) => { setTaskContent(event.target.value); setError(null); }} />
                </div>
                {taskContent.length > 0 && <Calendar28 plcHolder="Срок задачи" initialDate={dateTask} disabled={pending || uncertain}
                    onChange={(date: Date) => setDateTask(calendarDate(date))} />}
                {error && <p role="alert">{error}</p>}
                {uncertain && <Button type="button" onClick={refreshTasks} disabled={status === 'loading'}>Обновить список задач</Button>}
            </div>
            <DialogFooter>
                {sessionError && <Button type="button" onClick={retrySession}>Повторить проверку сессии</Button>}
                <Button type="button" className="btnInteractive" variant="yellow" disabled={pending || uncertain || status !== 'ready'} onClick={handleSubmit}>
                    {pending ? 'Сохранение…' : 'Добавить задачу'}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>;
}

function TasksList() {
    const [data, setData] = useState<Employee[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [taskLists, setTaskLists] = useState<Record<number, TaskSummary[]>>({});
    const [vacationStatus, setVacationStatus] = useState<Record<number, VacationPeriod | 'Отсутствует'>>({});
    const [detailsStatus, setDetailsStatus] = useState<Record<number, DetailsStatus>>({});
    const [loading, setLoading] = useState(true);
    const [listError, setListError] = useState<string | null>(null);
    const [revision, setRevision] = useState(0);
    const active = useRef(true);
    const detailsVersion = useRef<Record<number, number>>({});

    const loadDetails = useCallback(async (id: number): Promise<boolean> => {
        const version = (detailsVersion.current[id] || 0) + 1;
        detailsVersion.current[id] = version;
        setDetailsStatus((current) => ({ ...current, [id]: 'loading' }));
        try {
            const [tasks, vacation] = await Promise.all([
                api.get<{ user: TaskSummary[] }>(`/users/${id}/tasks`, { timeout: 15000 }),
                api.get<{ user: VacationPeriod | 'Отсутствует' }>(`/users/${id}/vacation`, { timeout: 15000 })
            ]);
            if (!active.current || detailsVersion.current[id] !== version) return false;
            if (!Array.isArray(tasks.data.user)) throw new Error('Некорректный список задач');
            const period = vacation.data.user;
            if (period !== 'Отсутствует' && (!period || typeof period !== 'object' ||
                typeof period.start_holiday !== 'string' || typeof period.end_holiday !== 'string')) {
                throw new Error('Некорректный отпуск сотрудника');
            }
            setTaskLists((current) => ({ ...current, [id]: tasks.data.user }));
            setVacationStatus((current) => ({ ...current, [id]: vacation.data.user }));
            setDetailsStatus((current) => ({ ...current, [id]: 'ready' }));
            return true;
        } catch (failure: unknown) {
            if (active.current && detailsVersion.current[id] === version) {
                setDetailsStatus((current) => ({ ...current, [id]: 'error' }));
                console.error('Ошибка загрузки данных сотрудника:', apiErrorMessage(failure));
            }
            return false;
        }
    }, []);

    useEffect(() => {
        active.current = true;
        const requests = detailsVersion.current;
        let cancelled = false;
        setLoading(true);
        setListError(null);
        async function loadEmployees() {
            try {
                const { data: employees } = await api.get<Employee[]>('/users', { timeout: 15000 });
                if (cancelled) return;
                if (!Array.isArray(employees)) throw new Error('Некорректный список сотрудников');
                setData(employees);
                await Promise.all(employees.map((employee) => loadDetails(employee.id)));
            } catch (failure: unknown) {
                if (!cancelled) setListError('Не удалось загрузить сотрудников. Повторите попытку.');
                console.error(apiErrorMessage(failure));
            } finally { if (!cancelled) setLoading(false); }
        }
        loadEmployees();
        return () => {
            cancelled = true;
            active.current = false;
            for (const id of Object.keys(requests)) requests[Number(id)]++;
        };
    }, [revision, loadDetails]);

    function handleCreated(id: number, task: TaskSummary) {
        detailsVersion.current[id] = (detailsVersion.current[id] || 0) + 1;
        setTaskLists((current) => ({ ...current, [id]: [...(current[id] || []).filter((item) => item.id !== task.id), task] }));
        void loadDetails(id);
    }
    const filteredUsers = data.filter((user) => `${user.fname} ${user.lname}`.toLowerCase().includes(searchTerm.toLowerCase()));
    return <div><div className="mainBlockUser">
        <div className="titleUser"><p>Сотрудники</p><div className="formSearch">
            <input type="text" className="searchUser" placeholder="Поиск сотрудника" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
            <button type="submit" className="buttonSearch" />
        </div></div>
        {loading && <p role="status">Загрузка сотрудников…</p>}
        {listError && <div role="alert">{listError} <button type="button" onClick={() => setRevision((value) => value + 1)}>Повторить</button></div>}
        <div className="columnUser">
            {!loading && !listError && filteredUsers.length === 0 && <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}><img src={imgUsersNone} alt="Сотрудников нет" width="600" /></div>}
            {filteredUsers.map((user) => <div className="rowUserTask" key={user.id}>
                <div className="divUser1 relative"><p className="nameUser" id="nameUser">{user.fname} {user.lname}
                    {detailsStatus[user.id] === 'ready' && vacationStatus[user.id] !== 'Отсутствует' && <Badge className="absolute h-4 badgeVacUser"><span>В отпуске</span></Badge>}
                </p></div>
                <div className="divUser2"><p>Задач: {taskLists[user.id] ? taskLists[user.id].length : '—'}</p>
                    {detailsStatus[user.id] === 'loading' && <p role="status">Обновление…</p>}
                    {detailsStatus[user.id] === 'error' && <p role="alert">Не удалось обновить данные сотрудника.</p>}
                    {detailsStatus[user.id] === 'error' && <button type="button" onClick={() => { void loadDetails(user.id); }}>Повторить загрузку</button>}
                </div>
                <div className="divUser2"><p>{user.post}</p></div>
                <div className="divUser3"><DialogTask user={user} tasks={taskLists[user.id] || []} status={detailsStatus[user.id] || 'loading'}
                    onRefresh={() => loadDetails(user.id)} onCreated={(task) => handleCreated(user.id, task)} /></div>
            </div>)}
        </div>
    </div></div>;
}
export default TasksList;
