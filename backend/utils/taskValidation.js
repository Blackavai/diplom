const { isValidDateInput } = require('./dateValidation');

function isValidTaskContent(value) {
    if (typeof value !== 'string' || !value.trim()) return false;
    // PostgreSQL не принимает NUL; одиночный суррогат изменился бы при UTF-8 кодировании.
    if (value.includes('\0') || /[\uD800-\uDFFF]/u.test(value)) return false;
    return Array.from(value).length <= 255;
}

function getTaskEndDate(updates) {
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) return null;
    const hasEndDate = Object.hasOwn(updates, 'end_date');
    const hasLegacyDate = Object.hasOwn(updates, 'date');
    if (hasEndDate && !isValidDateInput(updates.end_date)) return null;
    if (hasLegacyDate && !isValidDateInput(updates.date)) return null;

    // В DATE сохраняется календарная часть: разное время одного дня не создаёт конфликт.
    if (hasEndDate && hasLegacyDate && updates.end_date.slice(0, 10) !== updates.date.slice(0, 10)) return null;
    if (hasEndDate) return updates.end_date;
    if (hasLegacyDate) return updates.date;
    return null;
}

module.exports = { isValidTaskContent, getTaskEndDate };
