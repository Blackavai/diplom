function isValidUserText(value) {
    if (typeof value !== 'string' || !value.trim()) return false;
    // PostgreSQL не принимает NUL; одиночный суррогат изменился бы при UTF-8 кодировании.
    if (value.includes('\0') || /[\uD800-\uDFFF]/u.test(value)) return false;
    return Array.from(value).length <= 255;
}

function isValidUserAccount(value) {
    // Вход и recovery пока ограничивают tg_id длиной JS-строки.
    // Не создаём идентификатор, с которым существующий вход не сможет работать.
    return isValidUserText(value) && value.length <= 255;
}

module.exports = { isValidUserText, isValidUserAccount };
