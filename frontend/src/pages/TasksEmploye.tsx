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
import { Label } from "@/components/ui/label.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { isAxiosError } from 'axios';
import api, { apiErrorMessage } from '@/lib/api';
import { useNotification } from './Notification.tsx';
import { useAuth } from './AuthContext.tsx';
import { businessDate, displayDate } from '@/lib/dates';
import { createRequestKey } from '@/lib/requestKey';

interface TaskSummary {
    id: number;
    content: string;
    end_date: string;
}

interface TasksResponse {
    user: TaskSummary[];
}

interface DialogTaskProps {
    task: TaskSummary;
    onReported: (taskId: number) => void;
    onRefresh: () => Promise<boolean>;
}

export function DialogTask({ task, onReported, onRefresh }: DialogTaskProps) {
    const [reportContent, setReportContent] = useState("");
    const [pending, setPending] = useState(false);
    const [reportError, setReportError] = useState<string | null>(null);
    const [resultUncertain, setResultUncertain] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const busy = useRef(false);
    const submission = useRef<{ key: string; text: string; date: string } | null>(null);
    const active = useRef(true);
    const { addNotification } = useNotification();

    useEffect(() => {
        active.current = true;
        return () => { active.current = false; };
    }, []);

    function handleReportChange(event: ChangeEvent<HTMLInputElement>) {
        setReportContent(event.target.value);
        setReportError(null);
    }

    async function handleReportSubmit() {
        if (busy.current || resultUncertain) return;
        if (!reportContent.trim() || Array.from(reportContent).length > 255 ||
            reportContent.includes('\0') || /[\uD800-\uDFFF]/u.test(reportContent)) {
            setReportError('Введите текст отчёта от 1 до 255 символов без недопустимых символов.');
            return;
        }

        busy.current = true;
        setPending(true);
        setReportError(null);
        try {
            if (!submission.current || submission.current.text !== reportContent) {
                submission.current = { key: createRequestKey(), text: reportContent, date: businessDate() };
            }
            await api.post('/reports/new', {
                id_task: task.id,
                text_report: submission.current.text,
                end_date: submission.current.date
            }, { timeout: 15000, headers: { 'Idempotency-Key': submission.current.key } });
            if (!active.current) return;
            setReportContent("");
            addNotification('success', 'Отчёт успешно отправлен');
            onReported(task.id);
        } catch (error: unknown) {
            if (!active.current) return;
            console.error('Ошибка отправки отчёта:', apiErrorMessage(error));
            if (isAxiosError(error) && !error.response) {
                // Отсутствие ответа не доказывает откат: сервер мог уже сохранить отчёт.
                setResultUncertain(true);
                setReportError('Результат отправки не подтверждён. Обновите список задач перед повторной отправкой.');
            } else if (isAxiosError<{ message?: string }>(error)) {
                const message = error.response?.data?.message;
                setReportError(typeof message === 'string' ? message : 'Не удалось отправить отчёт. Повторите попытку.');
            } else {
                setReportError('Не удалось отправить отчёт. Проверьте сессию и повторите попытку.');
            }
        } finally {
            busy.current = false;
            if (active.current) setPending(false);
        }
    }

    async function refreshAfterUncertainResult() {
        setRefreshing(true);
        const refreshed = await onRefresh();
        if (!active.current) return;
        setRefreshing(false);
        if (refreshed) {
            setResultUncertain(false);
            setReportError(null);
        }
    }

    return (
        <Dialog>
            <DialogTrigger asChild>
                <img src={arrow} alt="arrow right" width="60px" className="box-shadow: 0 5px 10px rgba(0, 0, 0, 0.2) arrowAnim"/>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[40%] p-15">
                <DialogHeader>
                    <DialogTitle>Меню задач</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid items-center gap-4">
                        <Label htmlFor={'report-' + task.id} className="text-right">
                            {task.content}
                        </Label>
                        <div className="grid items-center gap-4 hrTitle py-2">
                            <input
                                id={'report-' + task.id}
                                type="text"
                                className="col-span-3 outlineFocus"
                                value={reportContent}
                                onChange={handleReportChange}
                                disabled={pending || resultUncertain}
                                placeholder="Отчёт о выполнении задачи"
                            />
                        </div>
                        {reportError && <p role="alert">{reportError}</p>}
                        {resultUncertain && (
                            <Button type="button" variant="yellow" className="btnInteractive"
                                disabled={refreshing} onClick={refreshAfterUncertainResult}>
                                {refreshing ? 'Обновление…' : 'Обновить список задач'}
                            </Button>
                        )}
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" className="btnInteractive" variant="yellow"
                        disabled={pending || resultUncertain} onClick={handleReportSubmit}>
                        {pending ? 'Отправка…' : 'Отправить отчёт'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function TasksEmploye() {
    const [tasksData, setTasksData] = useState<TaskSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [listError, setListError] = useState<string | null>(null);
    const requestVersion = useRef(0);
    const { user } = useAuth();
    const userId = user?.id;

    const loadTasks = useCallback(async () => {
        requestVersion.current += 1;
        const version = requestVersion.current;
        if (!userId) return false;
        setLoading(true);
        setListError(null);
        try {
            const response = await api.get<TasksResponse>('/users/' + userId + '/tasks', { timeout: 15000 });
            if (!Array.isArray(response.data.user)) throw new Error('Некорректный список задач');
            if (version !== requestVersion.current) return false;
            setTasksData(response.data.user);
            return true;
        } catch (error: unknown) {
            if (version !== requestVersion.current) return false;
            console.error('Ошибка загрузки задач:', apiErrorMessage(error));
            setListError('Не удалось обновить список задач. Повторите попытку.');
            return false;
        } finally {
            if (version === requestVersion.current) setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        setTasksData([]);
        void loadTasks();
        return () => { requestVersion.current += 1; };
    }, [loadTasks]);

    function handleReported(taskId: number) {
        // Подтверждённое завершение не должен отменить ранее начатый GET.
        requestVersion.current += 1;
        setTasksData((current) => current.filter((task) => task.id !== taskId));
        void loadTasks();
    }

    return (
        <div>
            <div className="mainBlockUser">
                <div className="titleUser">
                    <p>Список задач</p>
                </div>
                {loading && <p role="status">Загрузка задач…</p>}
                {listError && (
                    <div role="alert">
                        <p>{listError}</p>
                        <button type="button" className="btnInteractive" onClick={() => { void loadTasks(); }}>
                            Повторить
                        </button>
                    </div>
                )}
                <div className="columnUser">
                    {!loading && !listError && tasksData.length === 0 && (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            <p>Задач нет</p>
                        </div>
                    )}
                    {tasksData.map((task) => {
                        const formattedDate = displayDate(task.end_date);
                        return (
                            <div className="rowUserTask" key={task.id}>
                                <div className="divUser1 relative">
                                    <p>{task.content}</p>
                                </div>
                                <div className="divUser2">
                                    <p>Срок: {formattedDate}</p>
                                </div>
                                <div className="divUser2"/>
                                <div className="divUser2">
                                    <DialogTask task={task} onReported={handleReported} onRefresh={loadTasks}/>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default TasksEmploye;
