function isValidDateInput(value) {
    if (typeof value !== 'string' || value.length > 40) return false;
    // Сохраняем дату и ISO timestamp действующего API, исключая свободный разбор текста.
    // Парсер PostgreSQL отклоняет смещение часового пояса больше 15:59.
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:0\d|1[0-5]):[0-5]\d))?$/.exec(value);
    if (!match) return false;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (year < 1 || month < 1 || month > 12 || day < 1) return false;

    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const monthDays = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day > monthDays[month - 1]) return false;
    return Number.isFinite(Date.parse(value));
}

module.exports = { isValidDateInput };
