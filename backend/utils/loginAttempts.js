const { createHash } = require('node:crypto');

function createLoginAttempts({ now = Date.now, windowMs = 15 * 60 * 1000, accountLimit = 10, ipLimit = 60, maxEntries = 10000 } = {}) {
    const attempts = new Map();
    const keyFor = (value) => createHash('sha256').update(value).digest('hex');
    return {
        allowAttempt(account, ip) {
            const time = now();
            for (const [key, value] of attempts) if (value.until <= time) attempts.delete(key);
            const limits = [[keyFor(`ip:${ip}`), ipLimit]];
            if (account !== null) limits.push([keyFor(`account:${account}`), accountLimit]);
            if (limits.some(([key, limit]) => (attempts.get(key)?.count || 0) >= limit)) return false;
            if (attempts.size + limits.filter(([key]) => !attempts.has(key)).length > maxEntries) return false;
            for (const [key] of limits) {
                const value = attempts.get(key) || { count: 0, until: time + windowMs };
                value.count++;
                attempts.set(key, value);
            }
            return true;
        }
    };
}

module.exports = { createLoginAttempts, loginAttempts: createLoginAttempts() };
