const { createHmac, timingSafeEqual } = require('node:crypto');

const COOKIE_NAME = 'dailysync_session';

function readSessionCookie(req) {
    const values = (req.get('Cookie') || '').split(';')
        .map((part) => part.trim()).filter((part) => part.startsWith(COOKIE_NAME + '='));
    // Не выбираем произвольно одну из нескольких одноимённых cookie.
    if (values.length !== 1) return null;
    const value = values[0].slice(COOKIE_NAME.length + 1);
    return /^[A-Za-z0-9_.-]+$/.test(value) && value.length <= 4096 ? value : null;
}

function csrfToken(token) {
    return createHmac('sha256', process.env.JWT_SECRET).update('csrf:' + token).digest('hex');
}

function validCsrfToken(value, token) {
    return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) &&
        timingSafeEqual(Buffer.from(value, 'hex'), Buffer.from(csrfToken(token), 'hex'));
}

function setSessionCookie(res, token) {
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        // production здесь также используется для локального HTTP в Docker.
        secure: process.env.SESSION_COOKIE_SECURE === 'true',
        path: '/api',
        maxAge: 3600000
    });
    // Удаляем прежние доступные JavaScript копии при следующем входе.
    for (const name of ['token', 'userData', 'tokenExpiration']) res.clearCookie(name, { path: '/' });
}

function isBrowserLoginAllowed(req) {
    return req.get('X-Requested-With') === 'XMLHttpRequest' && req.get('Sec-Fetch-Site') !== 'cross-site';
}

module.exports = { COOKIE_NAME, readSessionCookie, csrfToken, validCsrfToken, setSessionCookie, isBrowserLoginAllowed };
