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
import React, { useEffect, useState } from "react";
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
import { useNotification } from './Notification.tsx';
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
export function Calendar28({ plcHolder, onChange }) {
    const [open, setOpen] = React.useState(false);
    const [date, setDate] = React.useState<Date | undefined>();
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
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            id="date-picker"
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

export function SelectUser({ setUserId }) {
    const [users, setUsers] = useState([]);
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState("");

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

    return (
        <div className="relative">
            <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Начните вводить ФИО"
                className="col-span-1 outlineFocus hrTitle rounded-none focus:shadow-none w-full"
            />
            <Popover open={open} onOpenChange={setOpen} modal={true}>
                <PopoverTrigger asChild>
                    <Button
                        variant="ghost"
                        className="absolute top-1/2 right-2 size-6 -translate-y-1/2"
                        onClick={() => setOpen(true)} // Open the popover when the button is clicked
                    >
                        <ChevronsUpDownIcon className="size-3.5" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0">
                    <Command>
                        <CommandInput placeholder="Начните вводить ФИО" />
                        <CommandList>
                            <CommandEmpty>Пользователь не найден</CommandEmpty>
                            <CommandGroup>
                                {users
                                    .filter(user =>
                                        `${user.fname} ${user.lname}`.toLowerCase().includes(value.toLowerCase())
                                    )
                                    .map((user) => (
                                        <CommandItem
                                            key={user.id}
                                            value={`${user.fname} ${user.lname}`}
                                            onSelect={(currentValue) => {
                                                setValue(currentValue === value ? "" : currentValue);
                                                setUserId(user.id); // Set the user ID when selected
                                                setOpen(false);
                                            }}
                                        >
                                            <CheckIcon
                                                className={cn(
                                                    "mr-2 h-4 w-4",
                                                    value === `${user.fname} ${user.lname}` ? "opacity-100" : "opacity-0"
                                                )}
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
        </div>
    );
}

export function DialogAddVacation({ setRefresh }) {
    const [userId, setUserId] = useState("");
    const [startHoliday, setStartDate] = useState("");
    const [endHoliday, setEndDate] = useState("");
    const [open, setOpen] = useState(false);
    const { addNotification } = useNotification();

    const addVacation = () => {
        const vacationData = {
            startHoliday,
            endHoliday,
        };

        axios
            .post(`http://localhost:5001/api/users/vacation/${userId}`, vacationData)
            .then((response) => {
                // console.log("Отпуск добавлен:", response.data);
                setUserId("");
                setStartDate("");
                setEndDate("");
                setOpen(false);
                addNotification('success', 'Отпуск успешно создан');
                setRefresh(prev => !prev);
            })
            .catch((error) => {
                console.error("Ошибка при создании отпуска:", error);
                addNotification('error', 'Ошибка при создании отпуска');
            });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button type={'submit'} className={'addVacationButt '} />
            </DialogTrigger>
            <DialogContent className="sm:max-w-[40%] p-15">
                <DialogHeader>
                    <DialogTitle>Меню отпусков</DialogTitle>
                </DialogHeader>
                <div className="grid gap-5 py-10">
                    <SelectUser setUserId={setUserId} />
                    <div>
                        <Calendar28
                            plcHolder={"Начало отпуска"}
                            onChange={(date) => setStartDate(date)}
                        />
                    </div>
                    <div>
                        <Calendar28
                            plcHolder={"Конец отпуска"}
                            onChange={(date) => setEndDate(date)}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant={"yellow"} className={'btnInteractive'} onClick={addVacation}>
                        Открыть отпуск
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function VacationList() {
    const [users, setUsers] = useState([]);
    const [refresh, setRefresh] = useState(false); // Состояние для обновления списка

    useEffect(() => {
        axios
            .get("http://localhost:5001/api/users/vacation/view")
            .then((response) => {
                // console.log(response.data); // Логируем данные
                setUsers(response.data.user); // Извлекаем массив пользователей
            })
            .catch((error) => {
                console.log(error);
                setUsers([]); // Устанавливаем пустой массив в случае ошибки
            });
    }, [refresh]); // Добавьте refresh в зависимости

    // Получаем текущую дату
    const today = new Date();

    // Фильтруем пользователей, оставляя только тех, у кого отпуск в будущем
    const upcomingUsers = users.filter(user => {
        const startDate = new Date(user.end_holiday);
        return startDate >= today; // Проверяем, начинается ли отпуск сегодня или позже
    });

    return (
        <div className={'mainBlockTeam'}>
            <div className={'titleVacation'}>
                <p>Сотрудники в отпуске</p>
                <DialogAddVacation setRefresh={setRefresh} /> {/* Передаем функцию обновления */}
            </div>

            <div className={'columnReport'}>
                {upcomingUsers.length === 0 ? (
                    <div style={{display: 'flex', justifyContent: 'center'}}>
                        <img src={imgVacationNone} alt="Описание изображения"  width={'500'}/>
                    </div>
                ) : (
                    upcomingUsers.map(user => {
                        const startDate = new Date(user.start_holiday);
                        const endDate = new Date(user.end_holiday);
                        const formattedStartDate = startDate.toLocaleDateString("ru-RU", {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit'
                        });
                        const formattedEndDate = endDate.toLocaleDateString("ru-RU", {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit'
                        });

                        return (
                            <div className={'rowReport'} key={user.id}>
                                <p className={'nameReport'} id={'nameReport'}>{user.fname} {user.lname}</p>
                                <p>{formattedStartDate} - {formattedEndDate}</p>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

export default VacationList;