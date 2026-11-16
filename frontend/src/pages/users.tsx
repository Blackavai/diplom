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
import api, { apiErrorMessage } from '@/lib/api';
import React, { useEffect, useRef, useState } from "react";
import axios from 'axios';
import {Button} from "@/components/ui/button.tsx";
import {Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select.tsx";
import { useNotification } from './Notification.tsx';
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

export function DialogDemo({ user, onDelete }: { user: UserSummary; onDelete: (id: number) => Promise<void> }) {
    const [CheckTeam, setCheckTeam] = useState([]);
    const [CheckVac, setCheckVac] = useState([]);
    const [CheckTask, setCheckTask] = useState([]);

    useEffect(() => {
        api
            .get(`/users/${user.id}/team`)
            .then((response) => {
                setCheckTeam(response.data);
            })
            .catch((error) => {
                console.log(apiErrorMessage(error));
            });
    }, [user.id]);

    useEffect(() => {
        api
            .get(`/users/${user.id}/vacation`)
            .then((response) => {
                setCheckVac(response.data.user);
            })
            .catch((error) => {
                console.log(apiErrorMessage(error));
            });
    }, [user.id]);

    useEffect(() => {
        api
            .get(`/users/${user.id}/tasks`)
            .then((response) => {
                setCheckTask(response.data.user);
            })
            .catch((error) => {
                console.log(apiErrorMessage(error));
            });
    }, [user.id]);



    const handleDelete = () => {
        onDelete(user.id); // Call the delete function passed from User component
    };

    return (
        <Dialog>
            <DialogTrigger asChild>
                <img src={pencil} alt={"arrow right"} width={"60px"}
                     className={"box-shadow: 0 5px 10px rgba(0, 0, 0, 0.2) pencilAnim "}/>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[40%] p-15">
                <DialogHeader>
                    <DialogTitle>Меню сотрудника</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid-cols-1 items-center gap-4 hrTitle">
                        <p>{user.fname} {user.lname}</p>
                    </div>
                    <div className="grid-cols-1 items-center gap-1 hrTitle">
                        <p>Роль: {user.post}</p>
                    </div>
                    <div className="grid grid-cols-1 items-center gap-4 hrTitle">
                        <p>ID: {user.tg_id}</p>
                    </div>
                    <div className="grid grid-cols-1 items-center gap-4 hrTitle">
                        <p>Команда: {CheckTeam.user}</p>
                    </div>
                    <div className="grid grid-cols-1 items-center gap-4 hrTitle">
                        <p>Отпуск: {CheckVac.start_holiday && CheckVac.end_holiday ? `${displayDate(CheckVac.start_holiday)} - ${displayDate(CheckVac.end_holiday)}` : "Отсутсвует"}</p>
                    </div>
                    <div className="grid grid-cols-1 items-center gap-4 hrTitle">
                        <p>Задач стоит: {CheckTask.length}</p>
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant={"red"} className={'btnInteractive'} onClick={handleDelete}>
                        Удалить сотрудника
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function DialogAddUser({ onCreated }: { onCreated: (user: CreatedUser) => void }) {
    const [pending, setPending] = useState(false);
    const busy = useRef(false);
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
            console.error("Ошибка при сохранении данных пользователя:", apiErrorMessage(error));
            const message = axios.isAxiosError<{ message?: string }>(error) && typeof error.response?.data?.message === 'string'
                ? error.response.data.message : 'Ошибка при сохранении данных пользователя';
            addNotification('error', message);
        } finally {
            busy.current = false;
            setPending(false);
        }
    };

    return (
        <Dialog>
            <DialogTrigger asChild>
                <button type={'button'} className={'addUser'}></button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[40%] p-15">
                <DialogHeader>
                    <DialogTitle>Меню добавления сотрудника</DialogTitle>
                </DialogHeader>
                <div className="grid gap-5 py-4">
                    <div className="grid grid-cols-1 items-center gap-4 hrTitle">
                        <Label htmlFor="username" className="text-right ">
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
                        <Label htmlFor="username" className="text-right ">
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
                        <Label htmlFor="username" className="text-right ">
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
                        <Label htmlFor="username" className="text-right ">
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
                        <Label htmlFor="username" className="text-right ">
                            Роль:
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
                        <Label htmlFor="username" className="text-right ">
                            Должность:
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

    useEffect(() => {
        let active = true;
        const version = ++requestVersion.current;
        setListError(null);
        async function loadUsers() {
            try {
                const response = await api.get<UserSummary[]>('/users', { timeout: 15000 });
                if (!Array.isArray(response.data)) throw new Error('Некорректный список сотрудников');
                if (active && version === requestVersion.current) setData(response.data);
            } catch (error: unknown) {
                if (!active || version !== requestVersion.current) return;
                console.error('Ошибка загрузки сотрудников:', apiErrorMessage(error));
                setListError('Не удалось обновить список сотрудников. Повторите попытку.');
            }
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

    const deleteUser = async (userId: number) => {
        try {
            await api.delete(`/auth/delUser/${userId}`);
            // Прежняя загрузка списка могла начаться до удаления этой записи.
            requestVersion.current++;
            // Update the user list after deletion
            setData((prevData) => prevData.filter(user => user.id !== userId));
            addNotification('success', 'Сотрудник удалён из системы');

        } catch (error) {
            addNotification('error', axios.isAxiosError<{ message?: string }>(error) && error.response?.status === 409
                ? error.response.data.message || 'Сотрудник связан с другими данными' : 'Ошибка удаления сотрудника');
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
                {listError && (
                    <div role="alert">
                        <p>{listError}</p>
                        <button type="button" className="btnInteractive" onClick={refreshUsers}>Повторить</button>
                    </div>
                )}
                <div className={'columnUser'}>
                    {filteredUsers.length === 0 ? (
                        <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                            <img src={imgUsersNone} alt="Описание изображения" width={'600'}/>
                        </div>
                    ) : (
                        filteredUsers.map(user => (
                            <div className={'rowUser'} key={user.id}>
                                <div className={'divUser1'}>
                                    <p className={'nameUser'} id={'nameUser'}>{user.fname} {user.lname}</p>
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
