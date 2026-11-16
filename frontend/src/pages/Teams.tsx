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
import api, { apiErrorMessage } from '@/lib/api';
import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover.tsx";
import {CheckIcon} from "lucide-react";
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList} from "@/components/ui/command.tsx";
import { useNotification } from './Notification.tsx';
import imgTeamNone from '@/assets/team_none.png';
import { useAuth } from './AuthContext.tsx';
import { createRequestKey } from '@/lib/requestKey';

type TeamUser = { id: number; fname: string; lname: string; post?: string };
type Team = { id: number; name_team: string; description_team: string | null };
type SelectionProps = {
    selectedUsers: TeamUser[];
    setSelectedUsers: Dispatch<SetStateAction<TeamUser[]>>;
    excludedUsers?: TeamUser[];
    disabled?: boolean;
};

export function SelectUser({ selectedUsers, setSelectedUsers, excludedUsers = [], disabled = false }: SelectionProps) {
    const [users, setUsers] = useState<TeamUser[]>([]);
    const [error, setError] = useState(false);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        api
            .get("/users")
            .then((response) => {
                setUsers(response.data);
            })
            .catch((error) => {
                console.log(apiErrorMessage(error));
                setError(true);
            });
    }, []);

    const handleSelectUser = (user: TeamUser) => {
        if (disabled || excludedUsers.some((member) => member.id === user.id)) return;
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
                    disabled={disabled}
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
                        <CommandEmpty>{error ? "Не удалось загрузить пользователей. Откройте страницу повторно" : "Пользователь не найден"}</CommandEmpty>
                        <CommandGroup>
                            {users.filter((user) => !excludedUsers.some((member) => member.id === user.id)).map((user) => (
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

type TeamMenuProps = {
    team: Team;
    deleteTeam: (id: number) => Promise<void>;
    updateTeamData: (team: Team) => void;
    refreshTeams: () => void;
};

export function DialogMenuTeam({ team, deleteTeam, updateTeamData, refreshTeams }: TeamMenuProps) {
    const { sessionError, retrySession } = useAuth();
    const [dataTeam, setDataTeam] = useState<TeamUser[]>([]);
    const [open, setOpen] = useState(false);
    const [teamName, setTeamName] = useState(team.name_team);
    const [teamDescription, setTeamDescription] = useState(team.description_team ?? "");
    const [selectNewUser, setSelectNewUser] = useState<TeamUser[]>([]);
    const [saving, setSaving] = useState(false);
    const busy = useRef(false);
    const [loading, setLoading] = useState(false);
    const [membersError, setMembersError] = useState(false);
    const [revision, setRevision] = useState(0);
    const { addNotification } = useNotification();

    const handleOpenChange = (nextOpen: boolean) => {
        if (busy.current) return;
        if (nextOpen) {
            setTeamName(team.name_team);
            setTeamDescription(team.description_team ?? "");
            setSelectNewUser([]);
            setDataTeam([]);
            setLoading(true);
            setMembersError(false);
        }
        setOpen(nextOpen);
    };

    useEffect(() => {
        if (!open) return;
        let active = true;
        setLoading(true);
        setMembersError(false);
        async function loadMembers() {
            try {
                const { data } = await api.get<{ view: TeamUser[] }>(`/teams/view/${team.id}`, { timeout: 15000 });
                if (!active) return;
                setDataTeam(data.view);
                setSelectNewUser((selected) => selected.filter((user) => !data.view.some((member) => member.id === user.id)));
            } catch (error: unknown) {
                if (active) setMembersError(true);
                console.error(apiErrorMessage(error));
            } finally {
                if (active) setLoading(false);
            }
        }
        loadMembers();
        return () => { active = false; };
    }, [open, team.id, revision]);

    const deleteUserTeam = async (id_user: number) => {
        if (busy.current) return;
        busy.current = true;
        setSaving(true);
        try {
            await api.post(`/teams/delUserTeam/${team.id}/${id_user}`, {}, { timeout: 15000 });
            setDataTeam((previous) => previous.filter((member) => member.id !== id_user));
            addNotification('success', 'Участник удалён из команды');
        } catch (error) {
            console.error(apiErrorMessage(error));
            addNotification('error', 'Ошибка при удалении участника');
        } finally {
            busy.current = false;
            setSaving(false);
        }
    };

    const saveTeamData = async () => {
        if (busy.current || loading || membersError) return;
        busy.current = true;
        setSaving(true);
        try {
            const response = await api.put(`/teams/edit/${team.id}`, {
                newNameTeam: teamName,
                descriptionTeam: teamDescription,
                usersId: selectNewUser.map((user) => user.id),
            }, { timeout: 15000 });
            setSelectNewUser([]);
            updateTeamData(response.data.edit);
            setRevision((value) => value + 1);
            refreshTeams();
            addNotification('success', 'Данные команды обновлены');
        } catch (error) {
            console.error(apiErrorMessage(error));
            addNotification('error', 'Ошибка при сохранении данных команды');
        } finally {
            busy.current = false;
            setSaving(false);
        }
    };

    const removeTeam = async () => {
        if (busy.current) return;
        busy.current = true;
        setSaving(true);
        try { await deleteTeam(team.id); }
        finally { busy.current = false; setSaving(false); }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
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
                            disabled={saving}
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
                                disabled={saving}
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
                                        <li key={`${member.id}-${index}`}>
                                            <span>{member.fname + " " + member.lname}</span>
                                            <button disabled={saving || loading} onClick={() => deleteUserTeam(member.id)} key={member.id}>
                                                <img src={delTeamUserButt} alt={''} className="w-6 h-6 "/>
                                            </button>
                                        </li>
                                    ))}
                                    {selectNewUser.map((member) => (
                                        <li key={member.id} className={'flex justify-between'}>
                                            {member.fname + " " + member.lname}
                                        </li>
                                    ))}
                                </>
                            ) : (
                                <li>Участников нет</li>
                            )}
                        </ol>
                        {loading && <p role="status">Загрузка участников…</p>}
                        {membersError && <div role="alert">Не удалось загрузить состав команды. <button onClick={() => setRevision((value) => value + 1)}>Повторить</button></div>}
                        <SelectUser selectedUsers={selectNewUser} setSelectedUsers={setSelectNewUser} excludedUsers={dataTeam} disabled={saving || loading || membersError} />
                    </div>
                </div>
                <DialogFooter>
                    {sessionError && <Button type="button" onClick={retrySession}>Повторить проверку сессии</Button>}
                    <Button type="submit" variant={"yellow"} className={'btnInteractive'} disabled={saving || loading || membersError} onClick={saveTeamData}>{saving ? "Сохранение…" : "Сохранить"}</Button>
                    <Button type="submit" variant={"red"} className={'btnInteractive'} disabled={saving} onClick={removeTeam}>Удалить команду</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


export function DialogAddTeam({ refreshTeams }: { refreshTeams: () => void }) {
    const { sessionError, retrySession } = useAuth();
    const [newUserTeam, setNewUserTeam] = useState<TeamUser[]>([]);
    const [teamName, setTeamName] = useState('');
    const [teamDescription, setTeamDescription] = useState('');
    const [open, setOpen] = useState(false);
    const { addNotification } = useNotification();

    const [saving, setSaving] = useState(false);
    const busy = useRef(false);
    const submission = useRef<{ key: string; payload: string } | null>(null);

    const handleRemoveUser = (userId: number) => {
        setNewUserTeam((prev) => prev.filter((user) => user.id !== userId));
    };

    const addTeamData = async () => {
        if (busy.current) return;
        busy.current = true;
        setSaving(true);
        try {
            const body = { nameTeam: teamName, descriptionTeam: teamDescription,
                usersId: newUserTeam.map((user) => user.id).sort((a, b) => a - b) };
            const payload = JSON.stringify(body);
            if (!submission.current || submission.current.payload !== payload) {
                submission.current = { key: createRequestKey(), payload };
            }
            await api.post('/teams/create', body, { timeout: 15000, headers: { 'Idempotency-Key': submission.current.key } });
            submission.current = null;
            refreshTeams();
            setOpen(false);
            setTeamName('');
            setTeamDescription('');
            setNewUserTeam([]);
            addNotification('success', 'Команда создана');
        } catch (error) {
            console.error(apiErrorMessage(error));
            addNotification('error', 'Ошибка при сохранении данных команды');
        } finally {
            busy.current = false;
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(value) => { if (!busy.current) setOpen(value); }}>
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
                            disabled={saving}
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
                                disabled={saving}
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
                                        <button disabled={saving} onClick={() => handleRemoveUser(user.id)}>
                                            <img src={delTeamUserButt} alt={''} className="w-6 h-6 btnInteractive"/>
                                        </button>
                                    </li>
                                ))}
                            </ol>
                        )}
                        <SelectUser selectedUsers={newUserTeam} setSelectedUsers={setNewUserTeam} disabled={saving} />
                    </div>
                </div>
                <DialogFooter>
                    {sessionError && <Button type="button" onClick={retrySession}>Повторить проверку сессии</Button>}
                    <Button type="button" variant={"yellow"} onClick={addTeamData} disabled={saving} className={'btnInteractive'}>{saving ? "Сохранение…" : "Сохранить"}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


function Teams() {
    const [data, setData] = useState<Team[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const { addNotification } = useNotification();

    useEffect(() => {
        fetchTeams();
    }, []);

    const fetchTeams = () => {
        api
            .get("/teams/")
            .then((response) => {
                setData(response.data);
            })
            .catch((error) => {
                console.log(apiErrorMessage(error));
            });
    };

    const deleteTeam = async (id_team: number) => {
        await api
            .delete(`/teams/delete/${id_team}`, { timeout: 15000 })
            .then(() => {
                setData((prevData) => prevData.filter(team => team.id !== id_team));
                addNotification('success', 'Команда успешно удалена');
            })
            .catch((error) => {
                console.error("Ошибка при удалении команды:", apiErrorMessage(error));
                addNotification('error', 'Ошибка при удалении команды');
            });
    };

    const updateTeamData = (updatedTeam: Team) => {
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
