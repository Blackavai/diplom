const jwt = require('jsonwebtoken');
const AuthModel = require('../models/authModel');

function positiveId(value) {
    if (typeof value !== 'number' && (typeof value !== 'string' || !/^[1-9]\d*$/.test(value))) return null;
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 && id <= 2147483647 ? id : null;
}

async function authenticate(req, res, next) {
    res.set('Cache-Control', 'no-store');
    const match = /^Bearer ([^\s]+)$/i.exec(req.get('Authorization') || '');
    if (!match) return res.status(401).json({ message: 'Требуется авторизация' });
    if (!process.env.JWT_SECRET) return res.status(500).json({ message: 'Ошибка сервера' });
    let decoded;
    try {
        decoded = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
        if (!decoded || typeof decoded !== 'object' || typeof decoded.id !== 'number' ||
            positiveId(decoded.id) === null || !Number.isFinite(decoded.exp)) {
            return res.status(401).json({ message: 'Недействительная сессия' });
        }
    } catch {
        return res.status(401).json({ message: 'Недействительная сессия' });
    }
    try {
        const user = await AuthModel.findUserById(decoded.id);
        if (!user) return res.status(401).json({ message: 'Недействительная сессия' });
        if (![1, 2].includes(user.role)) return res.status(403).json({ message: 'Доступ запрещён' });
        req.user = user;
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
