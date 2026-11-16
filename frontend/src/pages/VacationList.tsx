import { calendarDate, businessDate, displayDate } from '@/lib/dates';
import '../style/vacation.css';
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import axios from 'axios';
import type { Employee, VacationRecord } from '@/lib/types';
import { useAuth } from './auth-context';
import api, { apiErrorMessage, apiResponseMessage } from '@/lib/api';
import React, { useCallback, useEffect, useRef, useState } from "react";
import { CalendarIcon } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { cn } from "@/lib/utils"
import { useNotification } from './notification-context';
import imgVacationNone from "@/assets/vacation_none.png";

function formatDate(date: Date | undefined) {
    if (!date) {
        return ""
    }
    return date.toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "long",
        year: "numeric",
    })
}
function isValidDate(date: Date | undefined) {
    if (!date) {
        return false
    }
    return !isNaN(date.getTime())
}
interface CalendarProps { plcHolder: string; onChange: (date: Date) => void; disabled?: boolean; initialDate?: string }
export function Calendar28({ plcHolder, onChange, disabled = false, initialDate }: CalendarProps) {
    const [open, setOpen] = React.useState(false);
    const [date, setDate] = React.useState<Date | undefined>(() => initialDate ? new Date(initialDate + 'T00:00:00') : undefined);
    const [month, setMonth] = React.useState<Date | undefined>(date);
    const [value, setValue] = React.useState(formatDate(date));

    useEffect(() => {
        if (date) {
            setValue(formatDate(date));
            onChange(date); // Call the onChange prop to notify parent of the date change
        }
    }, [date, onChange]);

    return (
        <div className="flex flex-col gap-3">
            <div className="relative flex gap-2">
                <input
                    id="date"
                    disabled={disabled}
                    value={value}
                    placeholder={plcHolder}
                    className="col-span-3 outlineFocus hrTitle rounded-none focus:shadow-none w-full"
                    onChange={(e) => {
                        const date = new Date(e.target.value);
                        if (isValidDate(date)) {
                            setDate(date);
                            setMonth(date);
                        }
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "ArrowDown") {
                            e.preventDefault();
                            setOpen(true);
                        }
                    }}
                />
                <Popover open={open} onOpenChange={(value) => { if (!disabled) setOpen(value); }}>
                    <PopoverTrigger asChild>
                        <Button
                            id="date-picker"
                            disabled={disabled}
                            variant="ghost"
                            className="absolute top-1/2 right-2 size-6 -translate-y-1/2"
                        >
                            <CalendarIcon className="size-3.5" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent
                        className="w-auto overflow-hidden p-0"
                        align="end"
                        alignOffset={-8}
                        sideOffset={10}
                    >
                        <Calendar
                            mode="single"
                            disabled={disabled}
                            selected={date}
                            captionLayout="dropdown"
                            month={month}
                            onMonthChange={setMonth}
                            onSelect={(selectedDate) => {
                                setDate(selectedDate);
                                setOpen(false);
                            }}
                            startMonth={new Date(2025, 1)}
                            endMonth={new Date(2030, 12)}
                        />
                    </PopoverContent>
                </Popover>
            </div>
        </div>
    );
}

interface SelectUserProps { setUserId: (id: number | null) => void; disabled?: boolean }
export function SelectUser({ setUserId, disabled = false }: SelectUserProps) {
    const [users, setUsers] = useState<Employee[]>([]);
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState('');
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        let active = true;
        setLoading(true);
        setError(false);
        async function loadUsers() {
            try {
                const { data } = await api.get<Employee[]>('/users', { timeout: 15000 });
                if (!Array.isArray(data)) throw new Error('Некорректный список сотрудников');
                if (active) setUsers(data);
            } catch (failure: unknown) {
                if (active) setError(true);
                console.error(apiErrorMessage(failure));
            } finally { if (active) setLoading(false); }
        }
        loadUsers();
        return () => { active = false; };
    }, [revision]);
    return <div className="relative">
        <input type="text" value={value} disabled={disabled} placeholder="Начните вводить ФИО"
            className="col-span-1 outlineFocus hrTitle rounded-none focus:shadow-none w-full"
            onChange={(event) => { setValue(event.target.value); setSelectedId(null); setUserId(null); }} />
        {loading && <p role="status">Загрузка сотрудников…</p>}
        {error && <div role="alert">Не удалось загрузить сотрудников. <button type="button" disabled={disabled} onClick={() => setRevision((current) => current + 1)}>Повторить</button></div>}
        <Popover open={open} onOpenChange={(next) => { if (!disabled) setOpen(next); }} modal>
            <PopoverTrigger asChild><Button variant="ghost" disabled={disabled || loading}
                className="absolute top-1/2 right-2 size-6 -translate-y-1/2"><ChevronsUpDownIcon className="size-3.5" /></Button></PopoverTrigger>
            <PopoverContent className="p-0"><Command>
                <CommandInput placeholder="Начните вводить ФИО" disabled={disabled} />
                <CommandList><CommandEmpty>{error ? 'Не удалось загрузить сотрудников' : 'Пользователь не найден'}</CommandEmpty>
                    <CommandGroup>{users.filter((user) => `${user.fname} ${user.lname}`.toLowerCase().includes(value.toLowerCase())).map((user) => {
                        const fullName = `${user.fname} ${user.lname}`;
                        return <CommandItem key={user.id} value={`${user.id} ${fullName}`} onSelect={() => {
                            setValue(fullName); setSelectedId(user.id); setUserId(user.id); setOpen(false);
                        }}>
                            <CheckIcon className={cn('mr-2 h-4 w-4', selectedId === user.id ? 'opacity-100' : 'opacity-0')} />
                            <div className="userList"><p>{fullName}</p><span>{user.post}</span></div>
                        </CommandItem>;
                    })}</CommandGroup>
                </CommandList>
            </Command></PopoverContent>
        </Popover>
    </div>;
}

interface AddVacationProps { onCreated: () => void; onRefresh: () => Promise<boolean> }
export function DialogAddVacation({ onCreated, onRefresh }: AddVacationProps) {
    const [userId, setUserId] = useState<number | null>(null);
    const [startHoliday, setStartDate] = useState('');
    const [endHoliday, setEndDate] = useState('');
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState(false);
    const [uncertain, setUncertain] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const busy = useRef(false);
    const active = useRef(true);
    const { addNotification } = useNotification();
    const { sessionError, retrySession } = useAuth();
    useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
    async function addVacation() {
        if (busy.current || uncertain) return;
        if (!userId || !startHoliday || !endHoliday || startHoliday > endHoliday) {
            setError('Выберите сотрудника из списка и даты отпуска: начало не позже окончания.');
            return;
        }
        busy.current = true;
        setPending(true);
        setError(null);
        try {
            await api.post(`/users/vacation/${userId}`, { startHoliday, endHoliday }, { timeout: 15000 });
            if (!active.current) return;
            setUserId(null); setStartDate(''); setEndDate(''); setOpen(false);
            addNotification('success', 'Отпуск успешно создан');
            onCreated();
        } catch (failure: unknown) {
            if (!active.current) return;
            console.error('Ошибка создания отпуска:', apiErrorMessage(failure));
            if (axios.isAxiosError(failure) && (!failure.response || failure.response.status >= 500)) {
                setUncertain(true);
                setError('Сервер мог сохранить отпуск. Обновите список и проверьте его перед повторной отправкой.');
            } else setError(apiResponseMessage(failure, 'Не удалось создать отпуск. Проверьте сессию и повторите попытку.'));
        } finally {
            busy.current = false;
            if (active.current) setPending(false);
        }
    }
    async function refreshList() {
        setRefreshing(true);
        const refreshed = await onRefresh();
        if (!active.current) return;
        setRefreshing(false);
        if (refreshed) { setUncertain(false); setError(null); }
    }
    return <Dialog open={open} onOpenChange={(value) => {
        if (busy.current) return;
        if (value && !open) setUserId(null);
        setOpen(value);
    }}>
        <DialogTrigger asChild><button type="button" className="addVacationButt " /></DialogTrigger>
        <DialogContent className="sm:max-w-[40%] p-15">
            <DialogHeader><DialogTitle>Меню отпусков</DialogTitle></DialogHeader>
            <div className="grid gap-5 py-10">
                <SelectUser setUserId={setUserId} disabled={pending || uncertain} />
                <div><Calendar28 plcHolder="Начало отпуска" initialDate={startHoliday} disabled={pending || uncertain} onChange={(date) => setStartDate(calendarDate(date))} /></div>
                <div><Calendar28 plcHolder="Конец отпуска" initialDate={endHoliday} disabled={pending || uncertain} onChange={(date) => setEndDate(calendarDate(date))} /></div>
                {error && <p role="alert">{error}</p>}
                {uncertain && <Button type="button" disabled={refreshing} onClick={refreshList}>Обновить список отпусков</Button>}
            </div>
            <DialogFooter>
                {sessionError && <Button type="button" onClick={retrySession}>Повторить проверку сессии</Button>}
                <Button type="button" variant="yellow" className="btnInteractive" disabled={pending || uncertain} onClick={addVacation}>
                    {pending ? 'Сохранение…' : 'Открыть отпуск'}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>;
}

function VacationList() {
    const [users, setUsers] = useState<VacationRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const active = useRef(true);
    const version = useRef(0);
    const loadVacations = useCallback(async (): Promise<boolean> => {
        const current = ++version.current;
        setLoading(true); setError(false);
        try {
            const { data } = await api.get<{ user: VacationRecord[] }>('/users/vacation/view', { timeout: 15000 });
            if (!active.current || current !== version.current) return false;
            if (!Array.isArray(data.user)) throw new Error('Некорректный список отпусков');
            setUsers(data.user);
            return true;
        } catch (failure: unknown) {
            if (active.current && current === version.current) setError(true);
            console.error(apiErrorMessage(failure));
            return false;
        } finally { if (active.current && current === version.current) setLoading(false); }
    }, []);
    useEffect(() => {
        active.current = true;
        void loadVacations();
        return () => { active.current = false; };
    }, [loadVacations]);
    const upcomingUsers = users.filter((user) => user.end_holiday.slice(0, 10) >= businessDate());
    return <div className="mainBlockTeam">
        <div className="titleVacation"><p>Сотрудники в отпуске</p><DialogAddVacation onCreated={() => { void loadVacations(); }} onRefresh={loadVacations} /></div>
        {loading && <p role="status">Загрузка отпусков…</p>}
        {error && <div role="alert">Не удалось обновить список отпусков. <button type="button" onClick={() => { void loadVacations(); }}>Повторить</button></div>}
        <div className="columnReport">
            {!loading && !error && upcomingUsers.length === 0 && <div style={{ display: 'flex', justifyContent: 'center' }}><img src={imgVacationNone} alt="Отпусков нет" width="500" /></div>}
            {upcomingUsers.map((user, index) => <div className="rowReport" key={`${user.fname}:${user.lname}:${user.start_holiday}:${user.end_holiday}:${index}`}>
                <p className="nameReport" id="nameReport">{user.fname} {user.lname}</p>
                <p>{displayDate(user.start_holiday)} - {displayDate(user.end_holiday)}</p>
            </div>)}
        </div>
    </div>;
}
export default VacationList;
