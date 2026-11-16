export interface Employee {
    id: number;
    fname: string;
    lname: string;
    tg_id: string;
    post: string;
}

export interface TaskSummary {
    id: number;
    content: string;
    end_date: string;
}

export interface VacationPeriod {
    start_holiday: string;
    end_holiday: string;
}

export interface VacationRecord extends VacationPeriod {
    fname: string;
    lname: string;
}

export interface ReportSummary {
    id: number;
    id_task: string;
    id_user: string;
    text_report: string;
    end_date: string;
    status_task: boolean;
    check_report: boolean | null;
    fname: string;
    lname: string;
    content: string;
}
