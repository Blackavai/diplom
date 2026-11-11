import '../style/team.css';
import arrow from '../assets/right-arrow-upd.png';
import delTeamUserButt from '../assets/delTeamUser.png';
import addUserNewTeam from '../assets/addUserTeam.png';
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import axios from 'axios';
import React, { useEffect, useState } from "react";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover.tsx";
import {CheckIcon} from "lucide-react";
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList} from "@/components/ui/command.tsx";
import { useNotification } from './Notification.tsx';
import imgTeamNone from '@/assets/team_none.png';

export function SelectUser({ selectedUsers, setSelectedUsers }) {
    const [users, setUsers] = useState([]);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        axios
            .get("http://localhost:5001/api/users")
            .then((response) => {
                setUsers(response.data);
            })
            .catch((error) => {
                console.log(error);
            });
    }, []);

    const handleSelectUser = (user) => {
        setSelectedUsers((prev) => {
            if (prev.some((u) => u.id === user.id)) {
                return prev.filter((u) => u.id !== user.id);
            } else {
                return [...prev, user];
            }
        });
    };

    return (
        <Popover open={open} onOpenChange={setOpen} modal={true}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="flex w-30"
                >
                    <img src={addUserNewTeam} className="w-auto h-auto" alt="Добавить пользователя"/>
                    <p>Добавить</p>
                </Button>
            </PopoverTrigger>
            <PopoverContent className='p-0' side={"left"}>
                <Command>
                    <CommandInput placeholder="Начните вводить ФИО" />
                    <CommandList>
                        <CommandEmpty>Пользователь не найден</CommandEmpty>
                        <CommandGroup>
                            {users.map((user) => (
                                <CommandItem
                                    key={user.id}
                                    onSelect={() => handleSelectUser(user)}
                                >
                                    <CheckIcon
                                        className={selectedUsers.some((u) => u.id === user.id) ? "opacity-100" : "opacity-0"}
                                    />
                                    <div className={"userList"}>
                                        <p>{user.fname} {user.lname}</p>
                                        <span>{user.post}</span>
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

export function DialogMenuTeam({ team, deleteTeam, updateTeamData, refreshTeams }) {
    const [dataTeam, setDataTeam] = useState([]);
    const [open, setOpen] = useState(false);
    const [teamName, setTeamName] = useState(team.name_team);
    const [teamDescription, setTeamDescription] = useState(team.description_team);
    const [selectNewUser, setSelectNewUser] = useState([]);
    const { addNotification } = useNotification();

    useEffect(() => {
        axios
            .get(`http://localhost:5001/api/teams/view/${team.id}`)
            .then((response) => {
                // console.log(response);
                setDataTeam(response.data.view);
            })
            .catch((error) => {
                console.log(error);
            });
    }, [team.id]);

    const deleteUserTeam = (id_user) => {
        axios
            .post(`http://localhost:5001/api/teams/delUserTeam/${team.id}/${id_user}`)
            .then((response) => {
                // console.log("Участник удален:", response.data);
                setDataTeam((prevData) => prevData.filter(member => member.id !== id_user));
                addNotification('success', 'Участник удалён из команды');
            })
            .catch((error) => {
                console.error("Ошибка при удалении участника:", error);
                addNotification('error', 'Ошибка при удалении участника');
            });
    };

    const saveTeamData = async (id_team) => {
        try {
            const response = await axios.put(`http://localhost:5001/api/teams/edit/${id_team}`, {
                newNameTeam: teamName,
                descriptionTeam: teamDescription,
            });

            const userResponse = await axios.post(`http://localhost:5001/api/teams/newUserTeam/${id_team}`, {
                usersId: selectNewUser.map(user => user.id),
            });

            // console.log("Пользователи добавлены в команду:", userResponse.data);
            addNotification('success', 'Пользователи добавлены в команду');
            // console.log("Данные команды обновлены:", response.data);
            addNotification('success', 'Данные команды обновлены');
            updateTeamData({ id: id_team, name_team: teamName, description_team: teamDescription });
            refreshTeams();
        } catch (error) {
            console.error("Ошибка при сохранении данных команды:", error);
            addNotification('error', 'Ошибка при сохранении данных команды');
        }
    };

    return (
        <Dialog>
            <DialogTrigger asChild>
                <img src={arrow} alt={"arrow right "} width={"60px"} className={"box-shadow: 0 5px 10px rgba(0, 0, 0, 0.2) arrowAnim adaptArrow"} />
            </DialogTrigger>
            <DialogContent className="sm:max-w-[40%] p-15">
                <DialogHeader>
                    <DialogTitle>Меню команды</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid items-center gap-4 hrTitle">
                        <input
                            id="name"
                            value={teamName}
                            onChange={(e) => setTeamName(e.target.value)}
                            className="col-span-3 outlineFocus w-full"
                        />
                    </div>
                    <div className="items-center hrTitle">
                        <Label htmlFor="username" className="text-right ">
                            Описание:
                            <input
                                id="username"
                                className="col-span-3 outlineFocus w-full"
                                value={teamDescription}
                                onChange={(e) => setTeamDescription(e.target.value)}
                            />
                        </Label>
                    </div>
                    <div className="grid items-center gap-4">
                        <Label htmlFor="username" className="text-right">
                            Участники команды:
                        </Label>
                        <ol className={'liTeam list-decimal'}>
                            {dataTeam.length > 0 || selectNewUser.length > 0 ? (
                                <>
                                    {dataTeam.map((member, index) => (
                                        <li key={index}>
                                            <span>{member.fname + " " + member.lname}</span>
                                            <button onClick={() => deleteUserTeam(member.id)} key={member.id}>
                                                <img src={delTeamUserButt} alt={''} className="w-6 h-6 "/>
                                            </button>
                                        </li>
                                    ))}
                                    {selectNewUser.map((member, index) => (
                                        <li key={index} className={'flex justify-between'}>
                                            {member.fname + " " + member.lname}
                                        </li>
                                    ))}
                                </>
                            ) : (
                                <li>Участников нет</li>
                            )}
                        </ol>
                        <SelectUser selectedUsers={selectNewUser} setSelectedUsers={setSelectNewUser} />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="submit" variant={"yellow"} className={'btnInteractive'} onClick={() => saveTeamData(team.id)}>Сохранить</Button>
                    <Button type="submit" variant={"red"} className={'btnInteractive'} onClick={() => deleteTeam(team.id)}>Удалить команду</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


export function DialogAddTeam({ refreshTeams }) {
    const [newUserTeam, setNewUserTeam] = useState([]);
    const [teamName, setTeamName] = useState('');
    const [teamDescription, setTeamDescription] = useState('');
    const [open, setOpen] = useState(false);
    const { addNotification } = useNotification();

    const handleRemoveUser = (userId) => {
        setNewUserTeam((prev) => prev.filter((user) => user.id !== userId));
    };

    const addTeamData = () => {
        axios
            .post(`http://localhost:5001/api/teams/create`, {
                nameTeam: teamName,
                descriptionTeam: teamDescription,
            })
            .then((response) => {
                const id_team = response.data.task.id;
                addNotification('success', 'Команда создана');
                return axios.post(`http://localhost:5001/api/teams/newUserTeam/${id_team}`, {
                    usersId: newUserTeam.map(user => user.id),
                });
            })
            .then((userResponse) => {
                // console.log("Пользователи добавлены в команду:", userResponse.data);
                refreshTeams();
                setOpen(false);
                addNotification('success', 'Пользователи добавлены в команду');
            })
            .catch((error) => {
                console.error("Ошибка при сохранении данных команды:", error);
                addNotification('error', 'Ошибка при сохранении данных команды');
            });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button type={'button'} className={'addTeam'}></button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[40%] p-15">
                <DialogHeader>
                    <DialogTitle>Создание команды</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid items-center gap-4 hrTitle">
                        <input
                            id="name"
                            placeholder="Название"
                            className="col-span-3 outlineFocus"
                            value={teamName}
                            onChange={(e) => setTeamName(e.target.value)}
                        />
                    </div>
                    <div className="grid items-center gap-4 hrTitle">
                        <Label htmlFor="username" className="text-right">
                            Описание:
                            <input
                                placeholder="Введите описание"
                                className="col-span-3 outlineFocus"
                                value={teamDescription}
                                onChange={(e) => setTeamDescription(e.target.value)}
                            />
                        </Label>
                    </div>
                    <div className="grid items-center gap-4">
                        <Label htmlFor="username" className="text-right">
                            Участники команды:
                        </Label>
                        {newUserTeam.length === 0 ? (
                            <p>Участников нет</p>
                        ) : (
                            <ol type={"1"} className={'liTeam'}>
                                {newUserTeam.map((user) => (
                                    <li key={user.id}>
                                        {user.fname} {user.lname}
                                        <button onClick={() => handleRemoveUser(user.id)}>
                                            <img src={delTeamUserButt} alt={''} className="w-6 h-6 btnInteractive"/>
                                        </button>
                                    </li>
                                ))}
                            </ol>
                        )}
                        <SelectUser selectedUsers={newUserTeam} setSelectedUsers={setNewUserTeam} />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant={"yellow"} onClick={addTeamData} className={'btnInteractive'}>Сохранить</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


function Teams() {
    const [data, setData] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const { addNotification } = useNotification();

    useEffect(() => {
        fetchTeams();
    }, []);

    const fetchTeams = () => {
        axios
            .get("http://localhost:5001/api/teams/")
            .then((response) => {
                setData(response.data);
            })
            .catch((error) => {
                console.log(error);
            });
    };

    const deleteTeam = (id_team) => {
        axios
            .delete(`http://localhost:5001/api/teams/delete/${id_team}`)
            .then((response) => {
                // console.log("Команда удалена:", response.data);
                setData((prevData) => prevData.filter(team => team.id !== id_team));
                addNotification('success', 'Команда успешно удалена');
            })
            .catch((error) => {
                console.error("Ошибка при удалении команды:", error);
                addNotification('error', 'Ошибка при удалении команды');
            });
    };

    const updateTeamData = (updatedTeam) => {
        setData((prevData) =>
            prevData.map(team =>
                team.id === updatedTeam.id ? updatedTeam : team
            )
        );
    };

    return (
        <div>
            <div className={'mainBlockTeam'}>
                <div className={'titleTeam'}>
                    <p>Команды</p>
                    <div className={'formSearch'}>
                        <input
                            type={'text'}
                            className={'searchTeam'}
                            placeholder={'Поиск команды'}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <button type={'submit'} className={'buttonSearch '} />
                    </div>

                    <DialogAddTeam refreshTeams={fetchTeams} />
                </div>
                <div className={'columnTeam'}>
                    {data.length === 0 ?
                        (
                            <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                                <img src={imgTeamNone} alt="Описание изображения" width={'500'}/>
                            </div>
                        ) : (
                            data.filter(user => `${user.name_team}`.toLowerCase().includes(searchTerm.toLowerCase())).map(teams => (
                        <div className={'rowTeam'} key={teams.id}>
                            <div>
                                <p className={'nameTeam'} id={'nameTeam'}>{teams.name_team}</p>
                            </div>
                            <DialogMenuTeam team={teams} deleteTeam={deleteTeam} updateTeamData={updateTeamData} refreshTeams={fetchTeams} />
                        </div>
                        ))
                    )
                    }
                </div>
            </div>
        </div>
    );
}

export default Teams;