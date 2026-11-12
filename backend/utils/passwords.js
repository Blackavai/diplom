const { scrypt, randomBytes, timingSafeEqual, createHash } = require('node:crypto');

// OWASP scrypt configuration: 32 MiB, N=2^15, r=8, p=3. No password truncation.
const PREFIX = 'scrypt$1$32768$8$3$';
const PATTERN = /^scrypt\$1\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{128})$/;
const OPTIONS = Object.freeze({ N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
const isValidPassword = (value) => typeof value === 'string' && value.trim().length > 0;

function classifyPassword(value) {
    if (!isValidPassword(value)) return 'unusable';
    if (PATTERN.test(value)) return 'scrypt';
    // Never treat damaged/unsupported encoded credentials as plaintext.
    if (value.startsWith('scrypt$') || /^\$(?:2[abxy]\$|argon2|pbkdf2)/.test(value)) return 'unusable';
    return 'legacy';
}

function legacyLoginAllowed(env = process.env, now = Date.now()) {
    const deadline = env.LEGACY_PASSWORD_LOGIN_UNTIL;
    // Require an absolute timestamp with an explicit timezone, not a sliding window.
    if (typeof deadline !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(deadline)) return false;
    const localPart = deadline.slice(0, 19);
    const localTime = Date.parse(`${localPart}Z`);
    // Date.parse normalizes some invalid dates (e.g. February 30); fail closed.
    if (!Number.isFinite(localTime) || new Date(localTime).toISOString().slice(0, 19) !== localPart) return false;
    const end = Date.parse(deadline);
    return Number.isFinite(end) && now < end;
}

function createScryptQueue(compute = scrypt) {
    const queue = [];
    let active = 0;
    function drain() {
        while (active < 2 && queue.length) {
            const job = queue.shift();
            active++;
            const finish = (error, key) => {
                active--;
                if (error) job.reject(error); else job.resolve(key);
                drain();
            };
            try { compute(job.password, job.salt, 64, OPTIONS, finish); }
            catch (error) { finish(error); }
        }
    }
    return (password, salt) => new Promise((resolve, reject) => {
        if (active >= 2 && queue.length >= 16) {
            const error = new Error('Password hashing capacity exceeded');
            error.code = 'PASSWORD_HASH_BUSY';
            reject(error);
            return;
        }
        queue.push({ password, salt, resolve, reject });
        drain();
    });
}

const derive = createScryptQueue();
async function hashPassword(password) {
    if (!isValidPassword(password)) throw new TypeError('Invalid password');
    const salt = randomBytes(16);
    const key = await derive(password, salt);
    return `${PREFIX}${salt.toString('hex')}$${key.toString('hex')}`;
}

async function verifyPassword(password, stored, { allowLegacy = false } = {}) {
    if (!isValidPassword(password)) return { matches: false, needsUpgrade: false };
    const parsed = typeof stored === 'string' ? PATTERN.exec(stored) : null;
    // Unknown users, legacy values and invalid hashes still perform one KDF.
    const key = await derive(password, parsed ? Buffer.from(parsed[1], 'hex') : Buffer.alloc(16));
    if (parsed) return { matches: timingSafeEqual(key, Buffer.from(parsed[2], 'hex')), needsUpgrade: false };
    if (!allowLegacy || classifyPassword(stored) !== 'legacy') return { matches: false, needsUpgrade: false };
    const digest = (value) => createHash('sha256').update(value, 'utf8').digest();
    const matches = timingSafeEqual(digest(password), digest(stored));
    return { matches, needsUpgrade: matches };
}

module.exports = { hashPassword, verifyPassword, classifyPassword, isValidPassword, legacyLoginAllowed, createScryptQueue };
