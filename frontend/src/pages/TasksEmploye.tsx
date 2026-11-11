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
import {Button} from "@/components/ui/button.tsx";
import React, {useEffect, useState} from "react";
import axios from "axios";
import {Calendar28} from "@/pages/VacationList.tsx";
import { useNotification } from './Notification.tsx';
import Cookies from 'js-cookie';

export function DialogTask({ task, updateTasks }) {
     const [reportContent, setReportContent] = useState("");
    const { addNotification } = useNotification();

    const handleReportChange = (e) => {
        setReportContent(e.target.value);
    };

    const handleReportSubmit = async () => {
        if (!reportContent) {
            alert("Пожалуйста, заполните текст отчета.");
            return;
        }

        const reportData = {
            id_task: task.id,
            id_user: task.id_user,
            text_report: reportContent,
            end_date: new Date().toISOString() 
        };

        try {
            await axios.post('http://localhost:5001/api/reports/new', reportData);
            addNotification('success', 'Отчет успешно отправлен');
            setReportContent("");
        } catch (error) {
            console.error("Ошибка отправки отчета:", error);
            addNotification('error', 'Ошибка при отправке отчета');
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
                    <div className="grid items-center gap-4">
                        <Label htmlFor="task" className="text-right">
                            {task.content} 
                        </Label>
                        <div className="grid items-center gap-4 hrTitle py-2">
                        <input
                            id="reportText"
                            type={'text'}
                            className="col-span-3 outlineFocus"
                            value={reportContent}
                            onChange={handleReportChange}
                            placeholder={"Отчёт о выполнении задачи"}
                        />
                        </div>
                    </div>
                    
                </div>
                <DialogFooter>
                    <Button type="button" className={'btnInteractive'} variant={"yellow"} onClick={handleReportSubmit}>Отправить отчёт</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function TasksEmploye() {
    const [tasksData, setTasksData] = useState([]);
    const userData = Cookies.get('userData'); 
    const userId = userData ? JSON.parse(userData).id : null;

    useEffect(() => {
        if (userId) {
            axios.get(`http://localhost:5001/api/users/${userId}/tasks`)
                .then(response => {
                    setTasksData(response.data.user);
                })
                .catch(error => {
                    console.error("Ошибка получения задач:", error);
                });
        }
    }, [userId]);

    const updateTasks = (userId, newTask) => {
        setTasksData(prevTasks => [...prevTasks, newTask]);
    };

    return (
    <div>
        <div className={'mainBlockUser'}>
            <div className={'titleUser'}>
                <p>Список задач</p>
            </div>
            <div className={'columnUser'}>
                {tasksData.length === 0 ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <p>Задач нет</p>
                    </div>
                ) : (
                    tasksData.map(task => {
                        const dateFormat = new Date(task.end_date);
                        const formattedDate = dateFormat.toLocaleDateString("ru-RU", {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit'
                        });
                        
                        return (
                            <div className={'rowUserTask'} key={task.id}>
                                <div className={'divUser1 relative'}>
                                    <p>{task.content}</p>
                                </div>
                                <div className={'divUser2'}>
                                    <p>Срок: {formattedDate}</p>
                                </div>
                                <div className={'divUser2'}>
                                </div>
                                <div className={'divUser2'}>
                                    <DialogTask task={task} updateTasks={updateTasks} />
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

export default TasksEmploye;
