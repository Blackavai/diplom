const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPasswordRecovery, answersMatch, isNonEmptyString } = require('../utils/passwordRecovery');

test('only nonempty strings are accepted for recovery credentials', () => {
    for (const value of [null, undefined, {}, [], 123, '', '   ', 'a'.repeat(256)]) {
        assert.equal(isNonEmptyString(value), false);
        assert.equal(answersMatch(value, value), false);
    }
    assert.equal(answersMatch('ответ', 'ответ'), true);
    assert.equal(answersMatch('ответ', 'Ответ'), false);
    assert.equal(answersMatch(' ответ ', 'ответ'), false);
    assert.equal(isNonEmptyString('a'.repeat(255)), true);
});

test('a random grant is bound to one user and consumed once', () => {
    const recovery = createPasswordRecovery();
    const token = recovery.issue(42, 'test-owner');
    assert.match(token, /^[a-f0-9]{64}$/);
    assert.equal(recovery.consume(token, 'test-other'), null);
    assert.equal(recovery.consume('f'.repeat(64), 'test-owner'), null);
    assert.equal(recovery.consume(token, 'test-owner'), 42);
    assert.equal(recovery.consume(token, 'test-owner'), null);
    for (const value of [null, undefined, {}, '', 'a'.repeat(65)]) {
        assert.equal(recovery.consume(value, 'test-owner'), null);
    }
});

test('grant expires exactly at five minutes; restart loses grants', () => {
    let time = 1000;
    const recovery = createPasswordRecovery({ now: () => time });
    const token = recovery.issue(1, 'test-owner');
    time += 300000;
    assert.equal(recovery.consume(token, 'test-owner'), null);
    const fresh = recovery.issue(1, 'test-owner');
    assert.equal(createPasswordRecovery().consume(fresh, 'test-owner'), null);
    time += 299999;
    assert.equal(recovery.consume(fresh, 'test-owner'), 1);
});

test('issuing a new grant revokes the previous one, without affecting other users', () => {
    const recovery = createPasswordRecovery();
    const old = recovery.issue(1, 'test-owner');
    const other = recovery.issue(2, 'test-other');
    const fresh = recovery.issue(1, 'test-owner');
    assert.notEqual(old, fresh);
    assert.equal(recovery.consume(old, 'test-owner'), null);
    assert.equal(recovery.consume(other, 'test-other'), 2);
    assert.equal(recovery.consume(fresh, 'test-owner'), 1);
});

test('parallel requests cannot consume a grant twice', async () => {
    const recovery = createPasswordRecovery();
    const token = recovery.issue(1, 'test-owner');
    const results = await Promise.all(Array.from({ length: 20 }, async () => recovery.consume(token, 'test-owner')));
    assert.equal(results.filter((result) => result === 1).length, 1);
});

test('account limit persists across IPs, and IP limit across accounts', () => {
    const recovery = createPasswordRecovery({ accountLimit: 2, ipLimit: 3 });
    assert.equal(recovery.allowAttempt('a', 'ip1'), true);
    assert.equal(recovery.allowAttempt('a', 'ip2'), true);
    assert.equal(recovery.allowAttempt('a', 'ip3'), false);
    assert.equal(recovery.allowAttempt('b', 'ip1'), true);
    assert.equal(recovery.allowAttempt('c', 'ip1'), true);
    assert.equal(recovery.allowAttempt('d', 'ip1'), false);
});

test('attempt counters expire after the fixed window', () => {
    let time = 0;
    const recovery = createPasswordRecovery({ now: () => time, accountLimit: 1 });
    assert.equal(recovery.allowAttempt('a', 'ip'), true);
    time = 899999;
    assert.equal(recovery.allowAttempt('a', 'ip'), false);
    time = 900000;
    assert.equal(recovery.allowAttempt('a', 'ip'), true);
});

test('full stores fail closed and regain capacity after expiry', () => {
    let time = 0;
    const recovery = createPasswordRecovery({ now: () => time, maxEntries: 2 });
    assert.equal(recovery.allowAttempt('a', 'ip1'), true);
    assert.equal(recovery.allowAttempt('b', 'ip2'), false);
    const old = recovery.issue(1, 'a');
    recovery.issue(2, 'b');
    assert.equal(recovery.issue(3, 'c'), null);
    const fresh = recovery.issue(1, 'a');
    assert.equal(recovery.consume(old, 'a'), null);
    assert.equal(recovery.consume(fresh, 'a'), 1);
    time = 900000;
    assert.equal(recovery.allowAttempt('b', 'ip2'), true);
    assert.ok(recovery.issue(3, 'c'));
});
