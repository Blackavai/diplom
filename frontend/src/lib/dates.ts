// Календарные даты не переводим в UTC: выбранный в календаре день должен сохраниться.
export function calendarDate(date: Date): string {
    return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
