function apiNotFound(req, res) {
    res.set('Cache-Control', 'no-store');
    return res.status(404).json({ message: 'Маршрут API не найден' });
}

function apiErrorHandler(error, req, res, next) {
    if (res.headersSent) {
        // Повторный ответ уже невозможен. Express закроет соединение без исходного исключения.
        console.error('Ошибка API после отправки заголовков');
        return next(new Error('Ошибка сервера'));
    }

    let status = 500;
    let message = 'Ошибка сервера';
    const requestedStatus = error?.status ?? error?.statusCode;
    if (requestedStatus === 400) {
        status = 400;
        message = 'Некорректный запрос';
        if (error.type === 'entity.parse.failed') message = 'Некорректный JSON';
    } else if (requestedStatus === 413) {
        status = 413;
        message = 'Превышен допустимый размер запроса';
    } else if (requestedStatus === 415) {
        status = 415;
        message = 'Неподдерживаемая кодировка запроса';
    }

    res.set('Cache-Control', 'no-store');
    if (status === 500) {
        // Контроллер задаёт постоянное имя операции. Текст исключения и запрос не логируем.
        console.error(res.locals.errorOperation || 'Ошибка обработки запроса API');
        if (res.locals.errorResponseField === 'error') {
            return res.status(500).json({ error: message });
        }
    }
    return res.status(status).json({ message });
}

module.exports = { apiNotFound, apiErrorHandler };
