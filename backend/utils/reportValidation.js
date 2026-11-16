const { isValidDateInput } = require('./dateValidation');

function isValidReportText(value) {
    if (typeof value !== 'string' || !value.trim()) return false;
    // Эти символы нельзя сохранить без ошибки или изменения при UTF-8 кодировании.
    if (value.includes('\0') || /[\uD800-\uDFFF]/u.test(value)) return false;
    return Array.from(value).length <= 255;
}

module.exports = { isValidReportText, isValidReportDate: isValidDateInput };
