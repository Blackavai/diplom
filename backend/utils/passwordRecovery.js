const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');

const isNonEmptyString = (value, maxLength = 255) =>
    typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;

const digest = (value) => createHash('sha256').update(value).digest();

const answersMatch = (stored, supplied) =>
    isNonEmptyString(stored) && isNonEmptyString(supplied) &&
    timingSafeEqual(digest(stored), digest(supplied));

// One backend process owns these short-lived grants. A restart invalidates them.
function createPasswordRecovery({
    now = Date.now,
    tokenTtlMs = 5 * 60 * 1000,
    windowMs = 15 * 60 * 1000,
    accountLimit = 15,
    ipLimit = 60,
    maxEntries = 10000
} = {}) {
    const grants = new Map();
    const userGrants = new Map();
    const attempts = new Map();
    const keyFor = (value) => digest(value).toString('hex');

    function removeGrant(key) {
        const grant = grants.get(key);
        if (grant) userGrants.delete(grant.userId);
        grants.delete(key);
    }

    function prune() {
        const time = now();
        for (const [key, grant] of grants) {
            if (grant.expiresAt <= time) removeGrant(key);
        }
        for (const [key, attempt] of attempts) {
            if (attempt.expiresAt <= time) attempts.delete(key);
        }
    }

    return {
        allowAttempt(tgId, ip) {
            prune();
            const limits = [[keyFor(`account:${tgId}`), accountLimit], [keyFor(`ip:${ip}`), ipLimit]];
            if (limits.some(([key, limit]) => (attempts.get(key)?.count || 0) >= limit)) return false;
            const newEntries = limits.filter(([key]) => !attempts.has(key)).length;
            // Do not evict active counters: that would allow bypassing the limit.
            if (attempts.size + newEntries > maxEntries) return false;
            for (const [key] of limits) {
                const attempt = attempts.get(key) || { count: 0, expiresAt: now() + windowMs };
                attempt.count += 1;
                attempts.set(key, attempt);
            }
            return true;
        },
        issue(userId, tgId) {
            prune();
            const previous = userGrants.get(userId);
            if (!previous && grants.size >= maxEntries) return null;
            if (previous) removeGrant(previous);
            const token = randomBytes(32).toString('hex');
            const key = keyFor(token);
            grants.set(key, { userId, tgId, expiresAt: now() + tokenTtlMs });
            userGrants.set(userId, key);
            return token;
        },
        consume(token, tgId) {
            prune();
            if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
            const key = keyFor(token);
            const grant = grants.get(key);
            if (!grant || grant.tgId !== tgId) return null;
            // Consume synchronously before any database await, including on SQL failure.
            removeGrant(key);
            return grant.userId;
        }
    };
}

module.exports = { createPasswordRecovery, isNonEmptyString, answersMatch, recovery: createPasswordRecovery() };
