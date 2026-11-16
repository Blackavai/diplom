import { useCallback, useEffect, useRef, useState } from 'react';
import { displayDate } from '@/lib/dates';
import '../style/report.css';
import arrow from '@/assets/right-arrow-upd.png';
import imgReportNone from '@/assets/reports_none.png';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api, { apiErrorMessage, apiResponseMessage } from '@/lib/api';
import type { ReportSummary } from '@/lib/types';
import { useNotification } from './notification-context';
import { useAuth } from './auth-context';

interface DialogReportProps { userReport: ReportSummary; onAccepted: (id: number) => void }
export function DialogReport({ userReport, onAccepted }: DialogReportProps) {
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const busy = useRef(false);
    const active = useRef(true);
    const { addNotification } = useNotification();
    const { sessionError, retrySession } = useAuth();
    useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
    async function readReport() {
        if (busy.current) return;
        busy.current = true; setPending(true); setError(null);
        try {
            const { data } = await api.put<{ id: number; check_report: boolean }>(`/reports/accept/${userReport.id}`, {}, { timeout: 15000 });
            if (!active.current) return;
            if (data.id !== userReport.id || data.check_report !== true) throw new Error('Некорректный ответ принятия отчёта');
            setOpen(false);
            addNotification('success', 'Отчёт принят');
            onAccepted(userReport.id);
        } catch (failure: unknown) {
            if (active.current) setError(apiResponseMessage(failure, 'Не удалось подтвердить принятие отчёта. Повторите попытку.'));
            console.error('Ошибка принятия отчёта:', apiErrorMessage(failure));
        } finally { busy.current = false; if (active.current) setPending(false); }
    }
    return <Dialog open={open} onOpenChange={(value) => { if (!busy.current) setOpen(value); }}>
        <DialogTrigger asChild><img src={arrow} alt="arrow right" width="60px" className="box-shadow: 0 5px 10px rgba(0, 0, 0, 0.2) arrowAnim" /></DialogTrigger>
        <DialogContent className="sm:max-w-[40%] p-15">
            <DialogHeader><DialogTitle>Меню отчётов</DialogTitle></DialogHeader>
            <div className="grid gap-5 py-10">
                <div className="grid grid-cols-4 items-center gap-4 hrTitle"><p id="name" className="col-span-full">Отчитывающийся: {userReport.fname} {userReport.lname}</p></div>
                <div className="grid items-center gap-4"><Label htmlFor="username" className="text-right">Выполненные задачи:</Label><ol className="list-decimal liTeam"><li>{userReport.content}</li></ol></div>
                <div className="grid items-center gap-4"><Label htmlFor="username" className="text-right">Содержание отчёта:</Label><p>{userReport.text_report}</p></div>
                {error && <p role="alert">{error}</p>}
            </div>
            <DialogFooter>
                {sessionError && <Button type="button" onClick={retrySession}>Повторить проверку сессии</Button>}
                {!userReport.check_report && <Button type="button" variant="yellow" className="btnInteractive" disabled={pending} onClick={readReport}>
                    {pending ? 'Сохранение…' : 'Отчёт прочитан'}
                </Button>}
            </DialogFooter>
        </DialogContent>
    </Dialog>;
}

type ReportFilter = 'noWatched' | 'watched';
export function SelectDemo({ value, onSelect }: { value: ReportFilter; onSelect: (value: ReportFilter) => void }) {
    return <Select value={value} onValueChange={(next) => { if (next === 'watched' || next === 'noWatched') onSelect(next); }}>
        <SelectTrigger className="w-[350px] h-[100%] selectReport"><SelectValue placeholder="Запланировано" /></SelectTrigger>
        <SelectContent><SelectGroup><SelectItem value="noWatched">Запланировано</SelectItem><SelectItem value="watched">Просмотрено</SelectItem></SelectGroup></SelectContent>
    </Select>;
}

function ReportsList() {
    const [reports, setReports] = useState<ReportSummary[]>([]);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<ReportFilter>('noWatched');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const active = useRef(true);
    const version = useRef(0);
    const loadReports = useCallback(async () => {
        const current = ++version.current;
        setLoading(true); setError(false);
        try {
            const { data } = await api.get<ReportSummary[]>('/reports', { timeout: 15000 });
            if (!active.current || current !== version.current) return;
            if (!Array.isArray(data)) throw new Error('Некорректный список отчётов');
            setReports(data);
        } catch (failure: unknown) {
            if (active.current && current === version.current) setError(true);
            console.error(apiErrorMessage(failure));
        } finally { if (active.current && current === version.current) setLoading(false); }
    }, []);
    useEffect(() => {
        active.current = true;
        void loadReports();
        return () => { active.current = false; };
    }, [loadReports]);
    function handleAccepted(id: number) {
        version.current++;
        setReports((current) => current.map((report) => report.id === id ? { ...report, check_report: true } : report));
        void loadReports();
    }
    const filtered = reports.filter((report) => `${report.fname} ${report.lname}`.toLowerCase().includes(search.toLowerCase()) &&
        (filter === 'watched' ? Boolean(report.check_report) : !report.check_report));
    return <div><div className="mainBlockReport">
        <div className="titleReport"><p>Отчёты</p><div className="formSearch">
            <input type="text" className="searchReport" placeholder="Поиск отчёта" value={search} onChange={(event) => setSearch(event.target.value)} />
            <button type="submit" className="buttonSearch" />
        </div><div className="selectReport"><SelectDemo value={filter} onSelect={setFilter} /></div></div>
        {loading && <p role="status">Загрузка отчётов…</p>}
        {error && <div role="alert">Не удалось обновить список отчётов. <button type="button" onClick={() => { void loadReports(); }}>Повторить</button></div>}
        <div className="columnReport">
            {!loading && !error && filtered.length === 0 && <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}><img src={imgReportNone} alt="Отчётов нет" width="600" /></div>}
            {filtered.map((report) => <div className="rowReport" key={report.id}>
                <p className="nameReport" id="nameReport">{report.fname} {report.lname}</p><p>{displayDate(report.end_date)}</p>
                <DialogReport userReport={report} onAccepted={handleAccepted} />
            </div>)}
        </div>
    </div></div>;
}
export default ReportsList;
