const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, classifyPassword, isValidPassword, legacyLoginAllowed, createScryptQueue } = require('../utils/passwords');

test('scrypt uses random salts and does not accept a stored hash as the password', async () => {
    const first = await hashPassword('same-password');
    const second = await hashPassword('same-password');
    assert.notEqual(first, second);
    assert.equal(classifyPassword(first), 'scrypt');
    assert.equal((await verifyPassword('same-password', first)).matches, true);
    assert.equal((await verifyPassword('wrong-password', first)).matches, false);
    assert.equal((await verifyPassword(first, first, { allowLegacy: true })).matches, false);
});

test('long passwords, Unicode and spaces are preserved beyond 72 bytes and 1024 characters', async () => {
    const password = '  Пароль🔐'.repeat(200) + '\0café ';
    const hash = await hashPassword(password);
    assert.equal((await verifyPassword(password, hash)).matches, true);
    assert.equal((await verifyPassword(password.slice(0, -1), hash)).matches, false);
    assert.equal((await verifyPassword(password.normalize('NFD'), hash)).matches, false);
    assert.equal(isValidPassword('x'.repeat(10000)), true);
});

test('malformed hashes and unrecognised encoded schemes never fall back to plaintext', async () => {
    for (const stored of ['scrypt$broken', 'scrypt$1$999999999$8$3$bad$bad', '$2b$12$unsupported']) {
        assert.equal(classifyPassword(stored), 'unusable');
        assert.equal((await verifyPassword(stored, stored, { allowLegacy: true })).matches, false);
    }
    for (const value of [null, undefined, {}, [], 1, '', '   ']) {
        assert.equal(classifyPassword(value), 'unusable');
        assert.equal(isValidPassword(value), false);
    }
});

test('plaintext verification requires an explicit temporary legacy window', async () => {
    assert.equal((await verifyPassword('old-password', 'old-password')).matches, false);
    assert.deepEqual(await verifyPassword('old-password', 'old-password', { allowLegacy: true }), { matches: true, needsUpgrade: true });
    assert.equal((await verifyPassword('wrong-password', 'old-password', { allowLegacy: true })).matches, false);
    const now = Date.parse('2030-01-01T00:00:00Z');
    assert.equal(legacyLoginAllowed({}, now), false);
    for (const value of ['bad', '2030-01-02', '2030-01-02T00:00:00', '2030-02-30T00:00:00Z', '2030-01-02T24:00:00Z', '2029-12-31T23:59:59Z']) {
        assert.equal(legacyLoginAllowed({ LEGACY_PASSWORD_LOGIN_UNTIL: value }, now), false);
    }
    const env = { LEGACY_PASSWORD_LOGIN_UNTIL: '2030-01-02T03:00:00+03:00' };
    assert.equal(legacyLoginAllowed(env, now), true);
    assert.equal(legacyLoginAllowed(env, now + 86400000), false);
});

test('scrypt queue reserves at most two active jobs and sixteen waiting slots', async () => {
    const callbacks = [];
    let active = 0;
    let maximum = 0;
    const run = createScryptQueue((_password, _salt, _keylen, options, callback) => {
        assert.equal(options.maxmem, 64 * 1024 * 1024);
        maximum = Math.max(maximum, ++active);
        callbacks.push((error) => { active--; callback(error, Buffer.alloc(64)); });
    });
    const jobs = Array.from({ length: 18 }, () => run('test', Buffer.alloc(16)));
    await assert.rejects(run('overflow', Buffer.alloc(16)), { code: 'PASSWORD_HASH_BUSY' });
    while (callbacks.length) callbacks.shift()();
    await Promise.all(jobs);
    assert.equal(maximum, 2);
    const failure = run('test', Buffer.alloc(16));
    callbacks.shift()(new Error('synthetic failure'));
    await assert.rejects(failure);
    const next = run('test', Buffer.alloc(16));
    callbacks.shift()();
    await next;
});
