const jwt = require('jsonwebtoken');
const AuthModel = require('../models/authModel');
const { readSessionCookie, validCsrfToken } = require('../utils/sessionCookies');

function positiveId(value) {
    if (typeof value !== 'number' && (typeof value !== 'string' || !/^[1-9]\d*$/.test(value))) return null;
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 && id <= 2147483647 ? id : null;
}

async function authenticate(req, res, next) {
    res.set('Cache-Control', 'no-store');
    const authorization = req.get('Authorization');
    const match = /^Bearer ([^\s]+)$/i.exec(authorization || '');
    const token = authorization ? match?.[1] : readSessionCookie(req);
    if (!token) return res.status(401).json({ message: 'Требуется авторизация' });
    if (!process.env.JWT_SECRET) return res.status(500).json({ message: 'Ошибка сервера' });
    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
        if (!decoded || typeof decoded !== 'object' || typeof decoded.id !== 'number' ||
            positiveId(decoded.id) === null || !Number.isFinite(decoded.exp) ||
            !Number.isInteger(decoded.sessionVersion) || decoded.sessionVersion < 0 || decoded.sessionVersion > 2147483647) {
            return res.status(401).json({ message: 'Недействительная сессия' });
        }
    } catch {
        return res.status(401).json({ message: 'Недействительная сессия' });
    }
    if (!authorization) {
        if (typeof decoded.jti !== 'string' || !/^[a-f0-9]{32}$/.test(decoded.jti) ||
            (req.get('X-Session-Id') && req.get('X-Session-Id') !== decoded.jti)) {
            return res.status(401).json({ message: 'Недействительная сессия' });
        }
        const changesData = !['GET', 'HEAD', 'OPTIONS'].includes(req.method) ||
            /^\/api\/users\/delete\//.test(req.originalUrl);
        if (changesData && (!validCsrfToken(req.get('X-CSRF-Token'), token) ||
            req.get('X-Session-Id') !== decoded.jti || req.get('Sec-Fetch-Site') === 'cross-site')) {
            return res.status(403).json({ message: 'Не удалось подтвердить запрос. Обновите проверку сессии.' });
        }
    }
    try {
        const user = await AuthModel.findUserById(decoded.id);
        if (!user || user.session_version !== decoded.sessionVersion) return res.status(401).json({ message: 'Недействительная сессия' });
        if (![1, 2].includes(user.role)) return res.status(403).json({ message: 'Доступ запрещён' });
        req.user = user;
        req.authMode = authorization ? 'bearer' : 'cookie';
        req.authToken = token;
        req.sessionId = decoded.jti;
        return next();
    } catch {
        console.error('Ошибка проверки текущего пользователя');
        return res.status(500).json({ message: 'Ошибка сервера' });
    }
}

function requireManager(req, res, next) {
    if (req.user?.role !== 1) return res.status(403).json({ message: 'Доступ запрещён' });
    return next();
}

function requireSelfOrManager(req, res, next) {
    const id = positiveId(req.params.id);
    if (id === null) return res.status(400).json({ message: 'Некорректный идентификатор' });
    if (req.user?.role !== 1 && req.user?.id !== id) return res.status(403).json({ message: 'Доступ запрещён' });
    return next();
}

module.exports = { authenticate, requireManager, requireSelfOrManager, positiveId };
