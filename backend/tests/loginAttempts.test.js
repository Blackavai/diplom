const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLoginAttempts } = require('../utils/loginAttempts');

test('account limit persists across IP changes; IP limit persists across accounts', () => {
    const attempts = createLoginAttempts({ accountLimit: 2, ipLimit: 3 });
    assert.equal(attempts.allowAttempt('a', 'ip1'), true);
    assert.equal(attempts.allowAttempt('a', 'ip2'), true);
    assert.equal(attempts.allowAttempt('a', 'ip3'), false);
    assert.equal(attempts.allowAttempt('b', 'ip1'), true);
    assert.equal(attempts.allowAttempt('c', 'ip1'), true);
    assert.equal(attempts.allowAttempt('d', 'ip1'), false);
});
test('malformed accounts still count against IP and counters expire at fixed deadline', () => {
    let time = 0;
    const attempts = createLoginAttempts({ now: () => time, ipLimit: 1 });
    assert.equal(attempts.allowAttempt(null, 'ip'), true);
    time = 899999;
    assert.equal(attempts.allowAttempt('a', 'ip'), false);
    time = 900000;
    assert.equal(attempts.allowAttempt('a', 'ip'), true);
});
test('full counter store fails closed instead of evicting existing limits', () => {
    const attempts = createLoginAttempts({ maxEntries: 2, accountLimit: 1 });
    assert.equal(attempts.allowAttempt('a', 'ip1'), true);
    assert.equal(attempts.allowAttempt('b', 'ip2'), false);
    assert.equal(attempts.allowAttempt('a', 'ip1'), false);
});
