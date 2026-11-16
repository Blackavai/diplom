// Календарные даты не переводим в UTC: выбранный в календаре день должен сохраниться.
export function calendarDate(date: Date): string {
    return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Date сам исправляет 31 февраля на март, поэтому сверяем все части дня.
export function parseCalendarInput(value: string): Date | undefined {
    const text = value.trim();
    let year: number;
    let month: number;
    let day: number;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        [year, month, day] = text.split('-').map(Number);
    } else if (/^\d{2}\.\d{2}\.\d{4}$/.test(text)) {
        [day, month, year] = text.split('.').map(Number);
    } else {
        return undefined;
    }
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return undefined;
    const date = new Date(0);
    date.setHours(0, 0, 0, 0);
    date.setFullYear(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
    return date;
}

export function businessDate(now = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Moscow',
        year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const value = (name: string) => parts.find((part) => part.type === name)?.value || '';
    return `${value('year').padStart(4, '0')}-${value('month')}-${value('day')}`;
}

export function displayDate(value: string): string {
    // Поддерживаем также прежние ISO-ответы при совместном переходе API/UI.
    const date = new Date(value.slice(0, 10) + 'T12:00:00Z');
    if (!Number.isFinite(date.getTime())) return 'Некорректная дата';
    return date.toLocaleDateString('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
}
