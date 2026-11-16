import axios from 'axios';
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
import api, { apiErrorMessage, apiResponseMessage } from '@/lib/api';
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover.tsx";
import {CheckIcon} from "lucide-react";
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList} from "@/components/ui/command.tsx";
import { useNotification } from './notification-context';
import imgTeamNone from '@/assets/team_none.png';
import { useAuth } from './auth-context';
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
    const [loading, setLoading] = useState(true);
    const [revision, setRevision] = useState(0);

    useEffect(() => {
        let active = true;
        setLoading(true); setError(false);
        async function loadUsers() {
            try {
                const { data } = await api.get<TeamUser[]>('/users', { timeout: 15000 });
                if (!Array.isArray(data)) throw new Error('Некорректный список сотрудников');
                if (active) setUsers(data);
            } catch (failure: unknown) {
                if (active) setError(true);
                console.error(apiErrorMessage(failure));
            } finally { if (active) setLoading(false); }
        }
        void loadUsers();
        return () => { active = false; };
    }, [revision]);

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
                    disabled={disabled || loading}
                    aria-expanded={open}
                    className="flex w-30"
                >
                    <img src={addUserNewTeam} className="w-auto h-auto" alt="Добавить пользователя"/>
                    <p>Добавить</p>
                </Button>
            </PopoverTrigger>
            <PopoverContent className='p-0' align="start">
                <Command>
                    <CommandInput disabled={disabled || loading} placeholder="Начните вводить ФИО" />
                    <CommandList>
                        {loading && <p role="status">Загрузка сотрудников…</p>}
                        {error && <div role="alert">Не удалось загрузить сотрудников. <button type="button" disabled={disabled || loading} onClick={() => setRevision((current) => current + 1)}>Повторить</button></div>}
                        <CommandEmpty>{error ? "Не удалось загрузить пользователей" : "Пользователь не найден"}</CommandEmpty>
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
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
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
            if (!mounted.current) return;
            setDataTeam((previous) => previous.filter((member) => member.id !== id_user));
            addNotification('success', 'Участник удалён из команды');
        } catch (error) {
            if (!mounted.current) return;
            console.error(apiErrorMessage(error));
            addNotification('error', 'Ошибка при удалении участника');
        } finally {
            busy.current = false;
            if (mounted.current) setSaving(false);
        }
    };

    const saveTeamData = async () => {
        if (busy.current || loading || membersError) return;
        busy.current = true;
        setSaving(true);
        try {
            const response = await api.put<{ edit: Team }>(`/teams/edit/${team.id}`, {
                newNameTeam: teamName,
                descriptionTeam: teamDescription,
                usersId: selectNewUser.map((user) => user.id),
            }, { timeout: 15000 });
            if (!mounted.current) return;
            setSelectNewUser([]);
            updateTeamData(response.data.edit);
            setRevision((value) => value + 1);
            refreshTeams();
            addNotification('success', 'Данные команды обновлены');
        } catch (error) {
            if (!mounted.current) return;
            console.error(apiErrorMessage(error));
            addNotification('error', 'Ошибка при сохранении данных команды');
        } finally {
            busy.current = false;
            if (mounted.current) setSaving(false);
        }
    };

    const removeTeam = async () => {
        if (busy.current) return;
        busy.current = true;
        setSaving(true);
        try { await deleteTeam(team.id); }
        finally { busy.current = false; if (mounted.current) setSaving(false); }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <button type="button" className="row-action" aria-label="Открыть карточку"><img src={arrow} alt={"arrow right "} width={"60px"} className={"box-shadow: 0 5px 10px rgba(0, 0, 0, 0.2) arrowAnim adaptArrow"} /></button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl p-6 sm:p-10">
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


export function DialogAddTeam({ onCreated }: { onCreated: (team: Team) => void }) {
    const { sessionError, retrySession } = useAuth();
    const [newUserTeam, setNewUserTeam] = useState<TeamUser[]>([]);
    const [teamName, setTeamName] = useState('');
    const [teamDescription, setTeamDescription] = useState('');
    const [open, setOpen] = useState(false);
    const { addNotification } = useNotification();

    const [saving, setSaving] = useState(false);
    const busy = useRef(false);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
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
            const { data } = await api.post<{ task: { id: number } }>('/teams/create', body, { timeout: 15000, headers: { 'Idempotency-Key': submission.current.key } });
            if (!mounted.current) return;
            if (!Number.isInteger(data.task?.id) || data.task.id <= 0) throw new Error('Некорректный ответ создания команды');
            submission.current = null;
            onCreated({ id: data.task.id, name_team: teamName, description_team: teamDescription });
            setOpen(false);
            setTeamName('');
            setTeamDescription('');
            setNewUserTeam([]);
            addNotification('success', 'Команда создана');
        } catch (error) {
            if (!mounted.current) return;
            console.error(apiErrorMessage(error));
            addNotification('error', apiResponseMessage(error, 'Не удалось подтвердить создание команды. Повтор сохранит тот же ключ запроса.'));
        } finally {
            busy.current = false;
            if (mounted.current) setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(value) => { if (!busy.current) setOpen(value); }}>
            <DialogTrigger asChild>
                <button type={'button'} className={'addTeam'} aria-label="Добавить команду"></button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl p-6 sm:p-10">
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

    const [loading, setLoading] = useState(true);
    const [listError, setListError] = useState<string | null>(null);
    const active = useRef(true);
    const requestVersion = useRef(0);
    const fetchTeams = useCallback(async () => {
        const version = ++requestVersion.current;
        setLoading(true); setListError(null);
        try {
            const { data } = await api.get<Team[]>('/teams/', { timeout: 15000 });
            if (!active.current || version !== requestVersion.current) return;
            if (!Array.isArray(data)) throw new Error('Некорректный список команд');
            setData(data);
        } catch (failure: unknown) {
            if (active.current && version === requestVersion.current) setListError('Не удалось обновить список команд.');
            console.error(apiErrorMessage(failure));
        } finally { if (active.current && version === requestVersion.current) setLoading(false); }
    }, []);
    useEffect(() => {
        active.current = true;
        void fetchTeams();
        return () => { active.current = false; };
    }, [fetchTeams]);

    const deleteTeam = async (id_team: number) => {
        try {
            await api.delete(`/teams/delete/${id_team}`, { timeout: 15000 });
            if (!active.current) return;
            requestVersion.current++;
            setLoading(false);
            setData((current) => current.filter((team) => team.id !== id_team));
            addNotification('success', 'Команда успешно удалена');
        } catch (failure: unknown) {
            if (!active.current) return;
            if (axios.isAxiosError(failure) && failure.response?.status === 404) {
                requestVersion.current++;
                setLoading(false);
                setData((current) => current.filter((team) => team.id !== id_team));
                addNotification('success', 'Команда уже отсутствует в списке');
                return;
            }
            setListError('Удаление команды не подтверждено. Обновите список.');
            addNotification('error', apiResponseMessage(failure, 'Ошибка при удалении команды'));
        }
    };
    const updateTeamData = (updatedTeam: Team) => {
        requestVersion.current++;
        setLoading(false);
        setData((current) => current.map((team) => team.id === updatedTeam.id ? updatedTeam : team));
    };
    function handleCreated(team: Team) {
        requestVersion.current++;
        setData((current) => [...current.filter((item) => item.id !== team.id), team]);
        void fetchTeams();
    }

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

                    <DialogAddTeam onCreated={handleCreated} />
                </div>
                {loading && <p role="status">Загрузка команд…</p>}
                {listError && <div role="alert">{listError} <button type="button" onClick={() => { void fetchTeams(); }}>Повторить</button></div>}
                <div className={'columnTeam'}>
                    {!loading && !listError && data.filter((team) => team.name_team.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 ?
                        (
                            <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                                <img src={imgTeamNone} alt="Описание изображения" width={'500'}/>
                            </div>
                        ) : (
                            data.filter(user => `${user.name_team}`.toLowerCase().includes(searchTerm.toLowerCase())).map(teams => (
                        <div className={'rowTeam'} key={teams.id}>
                            <div>
                                <p className={'nameTeam'}>{teams.name_team}</p>
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
