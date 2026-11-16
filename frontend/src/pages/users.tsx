import { displayDate } from '@/lib/dates';
import '../style/user.css';
import {
    Dialog,
    DialogContent, DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from "@/components/ui/dialog.tsx";
import pencil from "@/assets/editUser.png";
import type { TaskSummary, VacationPeriod } from '@/lib/types';
import { useAuth } from './auth-context';
import api, { apiErrorMessage, apiResponseMessage } from '@/lib/api';
import { useEffect, useRef, useState } from "react";
import axios from 'axios';
import {Button} from "@/components/ui/button.tsx";
import {Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select.tsx";
import { useNotification } from './notification-context';
import imgUsersNone from "@/assets/users_none.png";
import { Label } from "@/components/ui/label"

interface UserSummary {
    id: number;
    fname: string;
    lname: string;
    tg_id: string;
    post: string;
}

interface CreatedUser extends UserSummary {
    role: 1 | 2;
}

interface CreateUserResponse {
    user: CreatedUser;
}

function isValidUserField(value: string) {
    if (!value.trim() || value.includes('\0') || /[\uD800-\uDFFF]/u.test(value)) return false;
    return Array.from(value).length <= 255;
}

export function DialogDemo({ user, onDelete }: { user: UserSummary; onDelete: (id: number) => Promise<boolean> }) {
    const [open, setOpen] = useState(false);
    const [team, setTeam] = useState<string | null>(null);
    const [vacation, setVacation] = useState<VacationPeriod | 'Отсутствует' | null>(null);
    const [tasks, setTasks] = useState<TaskSummary[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [revision, setRevision] = useState(0);
    const busy = useRef(false);
    const mounted = useRef(true);
    const { sessionError, retrySession } = useAuth();
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    useEffect(() => {
        if (!open) return;
        let active = true;
        setLoading(true); setError(null);
        async function loadDetails() {
            try {
                const [teamResponse, vacationResponse, taskResponse] = await Promise.all([
                    api.get<{ user: string }>(`/users/${user.id}/team`, { timeout: 15000 }),
                    api.get<{ user: VacationPeriod | 'Отсутствует' }>(`/users/${user.id}/vacation`, { timeout: 15000 }),
                    api.get<{ user: TaskSummary[] }>(`/users/${user.id}/tasks`, { timeout: 15000 })
                ]);
                if (!active) return;
                setTeam(teamResponse.data.user); setVacation(vacationResponse.data.user); setTasks(taskResponse.data.user);
            } catch (failure: unknown) {
                if (active) setError('Не удалось загрузить данные сотрудника.');
                console.error(apiErrorMessage(failure));
            } finally { if (active) setLoading(false); }
        }
        loadDetails();
        return () => { active = false; };
    }, [open, user.id, revision]);
    async function handleDelete() {
        if (busy.current || loading) return;
        busy.current = true; setPending(true);
        try {
            const deleted = await onDelete(user.id);
            if (!mounted.current) return;
            if (deleted) setOpen(false);
            else setError('Не удалось подтвердить удаление. Проверьте сообщение и обновите список сотрудников.');
        } finally { busy.current = false; if (mounted.current) setPending(false); }
    }
    const vacationText = vacation && typeof vacation === 'object'
        ? `${displayDate(vacation.start_holiday)} - ${displayDate(vacation.end_holiday)}` : vacation || '—';
    return <Dialog open={open} onOpenChange={(value) => { if (!busy.current) setOpen(value); }}>
        <DialogTrigger asChild><button type="button" className="row-action" aria-label="Открыть карточку"><img src={pencil} alt="arrow right" width="60px" className="box-shadow: 0 5px 10px rgba(0, 0, 0, 0.2) pencilAnim " /></button></DialogTrigger>
        <DialogContent className="sm:max-w-2xl p-6 sm:p-10">
            <DialogHeader><DialogTitle>Меню сотрудника</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid-cols-1 items-center gap-4 hrTitle"><p>{user.fname} {user.lname}</p></div>
                <div className="grid-cols-1 items-center gap-1 hrTitle"><p>Роль: {user.post}</p></div>
                <div className="grid grid-cols-1 items-center gap-4 hrTitle"><p>ID: {user.tg_id}</p></div>
                {loading && <p role="status">Загрузка данных сотрудника…</p>}
                <div className="grid grid-cols-1 items-center gap-4 hrTitle"><p>Команда: {team || '—'}</p></div>
                <div className="grid grid-cols-1 items-center gap-4 hrTitle"><p>Отпуск: {vacationText}</p></div>
                <div className="grid grid-cols-1 items-center gap-4 hrTitle"><p>Задач стоит: {tasks ? tasks.length : '—'}</p></div>
                {error && <div role="alert">{error} <button type="button" disabled={loading || pending} onClick={() => setRevision((value) => value + 1)}>Повторить</button></div>}
            </div>
            <DialogFooter>
                {sessionError && <Button type="button" onClick={retrySession}>Повторить проверку сессии</Button>}
                <Button type="button" variant="red" className="btnInteractive" disabled={loading || pending} onClick={handleDelete}>
                    {pending ? 'Удаление…' : 'Удалить сотрудника'}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>;
}

export function DialogAddUser({ onCreated }: { onCreated: (user: CreatedUser) => void }) {
    const [pending, setPending] = useState(false);
    const busy = useRef(false);
    const active = useRef(true);
    useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
    const [fname, setFname] = useState("");
    const [lname, setLname] = useState("");
    const [tg_id, setTgId] = useState("");
    const [pass, setPass] = useState("");
    const [post, setPost] = useState("");
    const [roleText, setRoleText] = useState(""); // Текстовое значение роли
    const [roleValue, setRoleValue] = useState<1 | 2 | null>(null); // Числовое значение роли
    const { addNotification } = useNotification();

    const addUserData = async () => {
        if (busy.current) return;
        if (!pass.trim()) { addNotification('error', 'Введите пароль'); return; }
        if (!isValidUserField(fname) || !isValidUserField(lname) || !isValidUserField(post)) {
            addNotification('error', 'Заполните имя, фамилию и должность: до 255 символов');
            return;
        }
        if (!isValidUserField(tg_id) || tg_id.length > 255) {
            addNotification('error', 'Введите корректный Telegram ID длиной до 255');
            return;
        }
        if (roleValue !== 1 && roleValue !== 2) {
            addNotification('error', 'Выберите роль: менеджер или работник');
            return;
        }
        busy.current = true;
        setPending(true);
        try {
            const { data } = await api.post<CreateUserResponse>(`/auth/createUser`, {
                fname,
                lname,
                tg_id,
                post,
                role: roleValue,
                pass,
            }, { timeout: 15000 });

            if (!active.current) return;
            onCreated(data.user);
            addNotification('success', 'Пользователь добавлен в систему');

            setFname("");
            setLname("");
            setTgId("");
            setPass("");
            setPost("");
            setRoleText("");
            setRoleValue(null);
        } catch (error) {
            if (!active.current) return;
            console.error("Ошибка при сохранении данных пользователя:", apiErrorMessage(error));
            const message = axios.isAxiosError<{ message?: string }>(error) && typeof error.response?.data?.message === 'string'
                ? error.response.data.message : 'Ошибка при сохранении данных пользователя';
            addNotification('error', message);
        } finally {
            busy.current = false;
            if (active.current) setPending(false);
        }
    };

    return (
        <Dialog>
            <DialogTrigger asChild>
                <button type={'button'} className={'addUser'} aria-label="Добавить сотрудника"></button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl p-6 sm:p-10">
                <DialogHeader>
                    <DialogTitle>Меню добавления сотрудника</DialogTitle>
                </DialogHeader>
                <div className="grid gap-5 py-4">
                    <div className="grid grid-cols-1 items-center gap-4 hrTitle">
                        <Label className="text-right ">
                            Имя:
                            <input
                                disabled={pending}
                                type="text"
                                className="col-span-3 outlineFocus w-full"
                                placeholder={'Введите имя сотрудника'}
                                value={fname}
                                onChange={(e) => setFname(e.target.value)}
                            />
                        </Label>
                    </div>
                    <div className="grid grid-cols-1 items-center gap-4 hrTitle">
                        <Label className="text-right ">
                            Фамилия:
                            <input
                                disabled={pending}
                                type="text"
                                className="col-span-3 outlineFocus w-full"
                                placeholder={'Введите фамилию сотрудника'}
                                value={lname}
                                onChange={(e) => setLname(e.target.value)}
                            />
                        </Label>
                    </div>
                    <div className="grid grid-cols-1 items-center gap-4 hrTitle">
                        <Label className="text-right ">
                            TG_id:
                            <input
                                disabled={pending}
                                type="text"
                                className="col-span-3 outlineFocus w-full"
                                placeholder={'Введите телеграм id сотрудника'}
                                value={tg_id}
                                onChange={(e) => setTgId(e.target.value)}
                            />
                        </Label>
                    </div>
                    <div className="grid grid-cols-1 items-center gap-4 hrTitle">
                        <Label className="text-right ">
                            Пароль:
                            <input
                                disabled={pending}
                                type="password"
                                className="col-span-3 outlineFocus w-full"
                                placeholder={'Введите пароль сотрудника'}
                                value={pass}
                                onChange={(e) => setPass(e.target.value)}
                            />
                        </Label>
                    </div>
                    <div className="grid grid-cols-1 items-center gap-4 hrTitle">
                        <Label className="text-right ">
                            Должность:
                            <input
                                disabled={pending}
                                type="text"
                                className="col-span-3 outlineFocus w-full"
                                placeholder={'Frontend, Backend, Дизайнер, Тестировщик и т.п.'}
                                value={post}
                                onChange={(e) => setPost(e.target.value)}
                            />
                        </Label>
                    </div>
                    <div className="grid grid-cols-1 items-center gap-4 hrTitle">
                        <Label className="text-right ">
                            Роль:
                            <Select value={roleText} disabled={pending} onValueChange={(value) => {
                                setRoleText(value);

                                if (value === 'менеджер') setRoleValue(1);
                                else if (value === 'работник') setRoleValue(2);
                                else setRoleValue(null);
                            }}>
                                <SelectTrigger className="w-full border-none p-0 focus-visible:none">
                                    <SelectValue placeholder="Работник или менеджер"/>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem value="работник">Работник</SelectItem>
                                        <SelectItem value="менеджер">Менеджер</SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </Label>
                    </div>
                </div>
                <DialogFooter>
                    <Button disabled={pending} type="submit" variant={"yellow"} className={'btnInteractive'} onClick={addUserData}>
                        {pending ? 'Сохранение…' : 'Добавить пользователя'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function User() {
    const [data, setData] = useState<UserSummary[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const {addNotification} = useNotification();

    const [refreshVersion, setRefreshVersion] = useState(0);
    const [listError, setListError] = useState<string | null>(null);
    const requestVersion = useRef(0);
    const mounted = useRef(true);
    const [loading, setLoading] = useState(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

    useEffect(() => {
        let active = true;
        const version = ++requestVersion.current;
        setListError(null);
        setLoading(true);
        async function loadUsers() {
            try {
                const response = await api.get<UserSummary[]>('/users', { timeout: 15000 });
                if (!Array.isArray(response.data)) throw new Error('Некорректный список сотрудников');
                if (active && version === requestVersion.current) setData(response.data);
            } catch (error: unknown) {
                if (!active || version !== requestVersion.current) return;
                console.error('Ошибка загрузки сотрудников:', apiErrorMessage(error));
                setListError('Не удалось обновить список сотрудников. Повторите попытку.');
            } finally { if (active && version === requestVersion.current) setLoading(false); }
        }
        void loadUsers();
        return () => { active = false; };
    }, [refreshVersion]);

    function refreshUsers() {
        requestVersion.current++;
        setRefreshVersion((value) => value + 1);
    }

    function handleUserCreated(user: CreatedUser) {
        // Сразу показываем созданную запись; затем перечитываем серверную сортировку.
        // Поздний ответ прежней загрузки не должен затереть нового сотрудника.
        if (user) setData((current) => [...current.filter((item) => item.id !== user.id), user]);
        refreshUsers();
    }

    const deleteUser = async (userId: number): Promise<boolean> => {
        try {
            await api.delete(`/auth/delUser/${userId}`, { timeout: 15000 });
            if (!mounted.current) return false;
            // Прежняя загрузка списка могла начаться до удаления этой записи.
            requestVersion.current++;
            setLoading(false);
            // Update the user list after deletion
            setData((prevData) => prevData.filter(user => user.id !== userId));
            addNotification('success', 'Сотрудник удалён из системы');
            return true;

        } catch (error) {
            if (!mounted.current) return false;
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                requestVersion.current++;
                setLoading(false);
                setData((current) => current.filter((user) => user.id !== userId));
                addNotification('success', 'Сотрудник уже отсутствует в списке');
                return true;
            }
            if (axios.isAxiosError(error) && !error.response) setListError('Результат удаления не подтверждён. Обновите список сотрудников.');
            addNotification('error', apiResponseMessage(error, 'Не удалось подтвердить удаление сотрудника.'));
            return false;
        }
    };

    const filteredUsers = data.filter(user =>
        `${user.fname} ${user.lname}`.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div>
            <div className={'mainBlockUser'}>
                <div className={'titleUser'}>
                    <p>Сотрудники</p>
                    <div className={'formSearch'}>
                        <input
                            type={'text'}
                            className={'searchUser'}
                            placeholder={'Поиск сотрудника'}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <button type={'submit'} className={'buttonSearch'}/>
                    </div>
                    <DialogAddUser onCreated={handleUserCreated} />
                </div>
                {loading && <p role="status">Загрузка сотрудников…</p>}
                {listError && (
                    <div role="alert">
                        <p>{listError}</p>
                        <button type="button" className="btnInteractive" onClick={refreshUsers}>Повторить</button>
                    </div>
                )}
                <div className={'columnUser'}>
                    {!loading && !listError && filteredUsers.length === 0 ? (
                        <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                            <img src={imgUsersNone} alt="Описание изображения" width={'600'}/>
                        </div>
                    ) : (
                        filteredUsers.map(user => (
                            <div className={'rowUser'} key={user.id}>
                                <div className={'divUser1'}>
                                    <p className={'nameUser'}>{user.fname} {user.lname}</p>
                                </div>
                                <div className={'divUser2'}>
                                    <p>{user.post}</p>
                                </div>
                                <div className={'divUser3'}>
                                    <DialogDemo user={user} onDelete={deleteUser} />
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

export default User;
