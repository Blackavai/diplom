import '../style/user.css';
import {
    Dialog,
    DialogContent, DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from "@/components/ui/dialog.tsx";
import pencil from "@/assets/editUser.png";
import axios from 'axios';
import React, { useEffect, useState } from "react";
import {Button} from "@/components/ui/button.tsx";
import {Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select.tsx";
import { useNotification } from './Notification.tsx';
import imgUsersNone from "@/assets/users_none.png";
import { Label } from "@/components/ui/label"

export function DialogDemo({ user, onDelete }) {
    const [CheckTeam, setCheckTeam] = useState([]);
    const [CheckVac, setCheckVac] = useState([]);
    const [CheckTask, setCheckTask] = useState([]);

    useEffect(() => {
        axios
            .get(`http://localhost:5001/api/users/${user.id}/team`)
            .then((response) => {
                setCheckTeam(response.data);
            })
            .catch((error) => {
                console.log(error);
            });
    }, [user.id]);

    useEffect(() => {
        axios
            .get(`http://localhost:5001/api/users/${user.id}/vacation`)
            .then((response) => {
                setCheckVac(response.data.user);
            })
            .catch((error) => {
                console.log(error);
            });
    }, [user.id]);

    useEffect(() => {
        axios
            .get(`http://localhost:5001/api/users/${user.id}/tasks`)
            .then((response) => {
                setCheckTask(response.data.user);
            })
            .catch((error) => {
                console.log(error);
            });
    }, [user.id]);

    const formatDate = (dateString) => {
        const options = { year: 'numeric', month: 'numeric', day: 'numeric' };
        return new Date(dateString).toLocaleDateString(undefined, options);
    };

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
                        <p>Отпуск: {CheckVac.start_holiday && CheckVac.end_holiday ? `${formatDate(CheckVac.start_holiday)} - ${formatDate(CheckVac.end_holiday)}` : "Отсутсвует"}</p>
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

export function DialogAddUser() {
    const [fname, setFname] = useState("");
    const [lname, setLname] = useState("");
    const [tg_id, setTgId] = useState("");
    const [pass, setPass] = useState("");
    const [post, setPost] = useState("");
    const [roleText, setRoleText] = useState(""); // Текстовое значение роли
    const [roleValue, setRoleValue] = useState(null); // Числовое значение роли
    const { addNotification } = useNotification();

    const addUserData = async () => {
        try {
            const response = await axios.post(`http://localhost:5001/api/auth/createUser`, {
                fname,
                lname,
                tg_id,
                post,
                role: roleValue,
                pass,
            });

            addNotification('success', 'Пользователь добавлен в систему');

            setFname("");
            setLname("");
            setTgId("");
            setPass("");
            setPost("");
            setRoleText("");
            setRoleValue(null);
        } catch (error) {
            console.error("Ошибка при сохранении данных пользователя:", error);
            addNotification('error', 'Ошибка при сохранении данных пользователя');
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
                            <Select onValueChange={(value) => {
                                setRoleText(value);

                                const roleMapping = {
                                    "менеджер": 1,
                                    "работник": 2,
                                };

                                setRoleValue(roleMapping[value] || null); // Используем value вместо selectedValue
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
                    <Button type="submit" variant={"yellow"} className={'btnInteractive'} onClick={addUserData}>
                        Добавить пользователя
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function User() {
    const [data, setData] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const {addNotification} = useNotification();

    useEffect(() => {
        axios
            .get("http://localhost:5001/api/users")
            .then((response) => {
                setData(response.data);
            })
            .catch((error) => {
                console.log(error);
            });
    }, []);

    const deleteUser = async (userId) => {
        try {
            await axios.delete(`http://localhost:5001/api/auth/delUser/${userId}`);
            // Update the user list after deletion
            setData((prevData) => prevData.filter(user => user.id !== userId));
            addNotification('success', 'Сотрудник удалён из системы');

        } catch (error) {
            addNotification('error', 'Ошибка удаления сотрудника');
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
                    <DialogAddUser />
                </div>
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