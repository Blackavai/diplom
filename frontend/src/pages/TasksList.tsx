import '../style/user.css';
import '../style/task.css';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from "@/components/ui/dialog.tsx";
import arrow from "@/assets/right-arrow-upd.png";
import {Label} from "@/components/ui/label.tsx";
import delTeamUserButt from "@/assets/delTeamUser.png";
import {Button} from "@/components/ui/button.tsx";
import React, {useEffect, useState} from "react";
import axios from "axios";
import {Calendar28} from "@/pages/VacationList.tsx";
import { useNotification } from './Notification.tsx';
import imgUsersNone from "@/assets/users_none.png";
import { Badge } from "@/components/ui/badge"

export function DialogTask({ user, tasks, updateTasks }) {
    const [dateTask, setDateTask] = useState("");
    const [taskContent, setTaskContent] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const { addNotification } = useNotification();

    const handleInputChange = (e) => {
        setTaskContent(e.target.value);
        setIsTyping(e.target.value.length > 0);
    };

    const handleSubmit = () => {
        const todayDay = new Date();
        if (taskContent && dateTask) {
            const newTask = {
                content: taskContent,
                id_user: user.id,
                end_date: dateTask.toISOString(),
                start_date: todayDay
            };

            axios.post('http://localhost:5001/api/tasks/new', newTask)
                .then(response => {
                    if (response.data.checkVacation) {
                        addNotification('error', response.data.message);
                    } else {
                        console.log("Task added successfully:", response.data);
                        updateTasks(user.id, newTask);
                        setTaskContent("");
                        setDateTask("");
                        setIsTyping(false);
                        addNotification('success', 'Задача успешно добавлена');
                    }
                })
                .catch(error => {
                    console.error("Ошибка добавления задачи:", error);
                    addNotification('error', 'Ошибка добавления задачи');
                });
        } else {
            alert("Пожалуйста, заполните все поля.");
        }
    };

    return (
        <Dialog>
            <DialogTrigger asChild>
                <img src={arrow} alt={"arrow right"} width={"60px"} className={"box-shadow: 0 5px 10px rgba(0, 0, 0, 0.2) arrowAnim"}/>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[40%] p-15">
                <DialogHeader>
                    <DialogTitle>Меню задач</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid-cols-1 items-center gap-4 hrTitle">
                        <p>Сотрудник: {user.fname} {user.lname} </p>
                    </div>
                    <div className="grid items-center gap-4">
                        <Label htmlFor="username" className="text-right">
                            Предстоящие задачи:
                        </Label>
                        <ol className={'list-decimal liTeam'}>
                            {tasks.length > 0 ? (
                                tasks.map((task, index) => (
                                    <li key={index}>{task.content}</li>
                                ))
                            ) : (
                                <p>Нет предстоящих задач</p>
                            )}
                        </ol>
                    </div>
                    <div className="grid items-center gap-4 hrTitle py-2">
                        <input
                            id="name"
                            type={'text'}
                            placeholder={"Напишите задачу"}
                            className="col-span-3 outlineFocus"
                            value={taskContent}
                            onChange={handleInputChange}
                        />
                    </div>
                    {isTyping && (
                        <Calendar28
                            plcHolder={"Срок задачи"}
                            onChange={(date) => setDateTask(date)}
                        />
                    )}
                </div>
                <DialogFooter>
                    <Button type="button" className={'btnInteractive'} variant={"yellow"} onClick={handleSubmit}>Добавить задачу</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function TasksList() {
    const [data, setData] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [taskLists, setTaskLists] = useState({});
    const [vacationStatus, setVacationStatus] = useState({}); // Local state for vacation status

    useEffect(() => {
        axios
            .get("http://localhost:5001/api/users")
            .then((response) => {
                setData(response.data);
                const tasksPromises = response.data.map(user =>
                    axios.get(`http://localhost:5001/api/users/${user.id}/tasks`)
                        .then((taskResponse) => {
                            return { id: user.id, tasks: taskResponse.data.user };
                        })
                );

                const vacationPromises = response.data.map(user =>
                    axios.get(`http://localhost:5001/api/users/${user.id}/vacation`)
                        .then((vacationResponse) => {
                            return { id: user.id, isOnVacation: vacationResponse.data.user };
                        })
                );

                Promise.all([Promise.all(tasksPromises), Promise.all(vacationPromises)])
                    .then(([tasksResults, vacationResults]) => {
                        const tasksMap = {};
                        tasksResults.forEach(result => {
                            tasksMap[result.id] = result.tasks;
                        });
                        setTaskLists(tasksMap);

                        const vacationMap = {};
                        vacationResults.forEach(result => {
                            vacationMap[result.id] = result.isOnVacation;
                        });
                        setVacationStatus(vacationMap); // Assuming you have a state for vacation status
                    })
                    .catch((error) => {
                        console.log(error);
                    });
            })
            .catch((error) => {
                console.log(error);
            });
    }, []);


    const filteredUsers = data.filter(user =>
        `${user.fname} ${user.lname}`.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const updateTasks = (userId, newTask) => {
        setTaskLists(prev => ({
            ...prev,
            [userId]: [...(prev[userId] || []), newTask]
        }));
    };



    return (
        <div>
            <div className={'mainBlockUser'}>
                <div className={'titleUser'}>
                    <p>Сотрудники</p>
                    <div className={'formSearch'}>
                        <input type={'text'} className={'searchUser'} placeholder={'Поиск сотрудника'} onChange={(e) => setSearchTerm(e.target.value)}/>
                        <button type={'submit'} className={'buttonSearch'}/>
                    </div>
                </div>
                <div className={'columnUser'}>
                    {filteredUsers.length === 0 ? (
                        <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                            <img src={imgUsersNone} alt="Описание изображения" width={'600'}/>
                        </div>
                    ) : (
                        filteredUsers.map(user => {
                            return (
                                <div className={'rowUserTask'} key={user.id}>
                                    <div className={'divUser1 relative'}>
                                        <p className={'nameUser'} id={'nameUser'}>
                                            {user.fname} {user.lname}
                                            {vacationStatus[user.id] !== "Отсутствует" && (<Badge className={"absolute h-4 badgeVacUser"}><span>В отпуске</span></Badge>)}
                                        </p>
                                    </div>
                                    <div className={'divUser2'}>
                                        <p>Задач: {taskLists[user.id] ? taskLists[user.id].length : 0}</p>
                                    </div>
                                    <div className={'divUser2'}>
                                        <p>{user.post}</p>
                                    </div>
                                    <div className={'divUser3'}>
                                        <DialogTask user={user} tasks={taskLists[user.id] || []} updateTasks={updateTasks}/>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}

export default TasksList;