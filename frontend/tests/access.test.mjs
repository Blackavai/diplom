import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import axios from 'axios';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Existing build dependencies only; these tests run in the frontend build image.
const require = createRequire(import.meta.url);
const directory = await mkdtemp(join(tmpdir(), 'itrum-access-client-'));
after(() => rm(directory, { recursive: true, force: true }));
const plugin = {
    name: 'test-dependencies',
    setup(builder) {
        builder.onResolve({ filter: /^(axios|react|react\/jsx-runtime|react-router-dom)$/ }, (args) => ({ path: require.resolve(args.path), external: true }));
        builder.onResolve({ filter: /^(js-cookie|sonner)$|AuthContext\.tsx$/ }, (args) => ({ path: args.path, namespace: 'test-mock' }));
        builder.onLoad({ filter: /.*/, namespace: 'test-mock' }, (args) => ({
            contents: args.path === 'js-cookie'
                ? 'export default { get: (key) => globalThis.__accessCookies[key] };'
                : args.path === 'sonner'
                    ? 'export const toast = { error: (...args) => globalThis.__accessToasts.push(args) };'
                    : 'export const useAuth = () => globalThis.__accessState;'
        }));
    }
};
async function bundle(entry, file) {
    const output = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', write: false, plugins: [plugin] });
    const path = join(directory, file);
    await writeFile(path, output.outputFiles[0].contents);
    return require(path);
}
const { default: api, publicApi, onUnauthorized, apiErrorMessage, setVerifiedSessionToken } = await bundle('src/lib/api.ts', 'api.cjs');
const { default: Guard } = await bundle('src/pages/AuthRedirect.tsx', 'guard.cjs');
beforeEach(() => {
    globalThis.__accessCookies = {};
    globalThis.__accessToasts = [];
    setVerifiedSessionToken(null);
});
const fail = (status) => async (config) => {
    throw new axios.AxiosError('Synthetic HTTP failure', 'ERR_BAD_RESPONSE', config, {}, { status, data: {}, headers: {}, config });
};
const success = async (config) => ({ status: 200, data: {}, headers: {}, config });

test('protected requests send the current Bearer token to the existing API', async () => {
    globalThis.__accessCookies.token = 'synthetic-one';
    api.defaults.adapter = success;
    const response = await api.get('/users');
    assert.equal(response.config.headers.get('Authorization'), 'Bearer synthetic-one');
    assert.equal(response.config.baseURL, '/api');
    assert.equal(publicApi.defaults.baseURL, '/api');
    globalThis.__accessCookies.token = 'synthetic-two';
    assert.equal((await api.get('/users')).config.headers.get('Authorization'), 'Bearer synthetic-two');
});

test('public login and recovery do not send session tokens or trigger session errors', async () => {
    globalThis.__accessCookies.token = 'synthetic-session';
    publicApi.defaults.adapter = success;
    assert.equal((await publicApi.post('/auth/login', {})).config.headers.has('Authorization'), false);
    let logouts = 0;
    const unsubscribe = onUnauthorized(() => logouts++);
    try {
        publicApi.defaults.adapter = fail(401);
        await assert.rejects(publicApi.post('/auth/login', {}));
        publicApi.defaults.adapter = fail(403);
        await assert.rejects(publicApi.post('/auth/recAns', {}));
        assert.equal(logouts, 0);
        assert.equal(globalThis.__accessToasts.length, 0);
    } finally { unsubscribe(); }
});

test('writes are blocked before verification and while a repeated check is pending or failed', async () => {
    globalThis.__accessCookies.token = 'synthetic-session';
    let sent = 0;
    api.defaults.adapter = async (config) => { sent++; return success(config); };
    for (const method of ['post', 'put', 'patch', 'delete']) {
        await assert.rejects(api.request({ method, url: '/teams/create', data: {} }), /проверки сессии/);
    }
    await assert.rejects(api.get('/users/delete/3'), /проверки сессии/);
    assert.equal(sent, 0);
    setVerifiedSessionToken('synthetic-session');
    await api.post('/teams/create', {});
    assert.equal(sent, 1);
    setVerifiedSessionToken(null);
    await assert.rejects(api.post('/teams/create', {}));
    assert.equal(sent, 1);
    setVerifiedSessionToken('synthetic-session');
    await api.post('/teams/create', {});
    assert.equal(sent, 2);
});

test('a changed cookie or explicitly different Bearer cannot write using an old verification', async () => {
    globalThis.__accessCookies.token = 'synthetic-old';
    setVerifiedSessionToken('synthetic-old');
    let sent = 0;
    api.defaults.adapter = async (config) => { sent++; return success(config); };
    globalThis.__accessCookies.token = 'synthetic-new';
    await assert.rejects(api.post('/teams/create', {}));
    globalThis.__accessCookies.token = 'synthetic-old';
    await assert.rejects(api.post('/teams/create', {}, { headers: { Authorization: 'Bearer synthetic-other' } }));
    assert.equal(sent, 0);
});

test('cookie expiry closes the local session without sending a pending form', async () => {
    globalThis.__accessCookies.token = 'synthetic-session';
    setVerifiedSessionToken('synthetic-session');
    let sent = 0;
    let logouts = 0;
    api.defaults.adapter = async (config) => { sent++; return success(config); };
    const unsubscribe = onUnauthorized(() => { logouts++; setVerifiedSessionToken(null); });
    try {
        delete globalThis.__accessCookies.token;
        await assert.rejects(api.post('/teams/create', {}));
        assert.equal(logouts, 1);
        assert.equal(sent, 0);
        // Cookie может истечь и после временного отказа фоновой проверки.
        setVerifiedSessionToken(null);
        await assert.rejects(api.post('/teams/create', {}));
        assert.equal(logouts, 2);
        assert.equal(sent, 0);
    } finally { unsubscribe(); }
});

test('401 of current session notifies logout subscribers', async () => {
    globalThis.__accessCookies.token = 'synthetic-session';
    api.defaults.adapter = fail(401);
    let logouts = 0;
    const unsubscribe = onUnauthorized(() => logouts++);
    try {
        await assert.rejects(api.get('/users'));
        assert.equal(logouts, 1);
    } finally { unsubscribe(); }
    await assert.rejects(api.get('/users'));
    assert.equal(logouts, 1);
});

test('late 401 of an old token does not log out the new session', async () => {
    globalThis.__accessCookies.token = 'synthetic-old';
    api.defaults.adapter = async (config) => {
        globalThis.__accessCookies.token = 'synthetic-new';
        return fail(401)(config);
    };
    let logouts = 0;
    const unsubscribe = onUnauthorized(() => logouts++);
    try {
        await assert.rejects(api.get('/users'));
        assert.equal(logouts, 0);
    } finally { unsubscribe(); }
});

test('403 shows permission error and 500 keeps session without logging out', async () => {
    globalThis.__accessCookies.token = 'synthetic-session';
    let logouts = 0;
    const unsubscribe = onUnauthorized(() => logouts++);
    try {
        api.defaults.adapter = fail(403);
        await assert.rejects(api.get('/users'));
        assert.equal(globalThis.__accessToasts[0][1].id, 'api-forbidden');
        api.defaults.adapter = fail(500);
        await assert.rejects(api.get('/users'));
        assert.equal(logouts, 0);
        assert.equal(globalThis.__accessToasts.length, 1);
    } finally { unsubscribe(); }
});

test('log sanitizer does not expose Authorization or response data', () => {
    const error = new axios.AxiosError('private-token', 'ERR_BAD_RESPONSE', { headers: { Authorization: 'Bearer private-token' } }, {}, { status: 403, data: 'private-data' });
    assert.equal(apiErrorMessage(error), 'HTTP 403');
    assert.equal(apiErrorMessage(new Error('private-token')), 'Ошибка запроса или соединения');
});

function renderGuard(state, roles = [1]) {
    globalThis.__accessState = state;
    return renderToString(React.createElement(MemoryRouter, { initialEntries: ['/users'] },
        React.createElement(Routes, null,
            React.createElement(Route, { element: React.createElement(Guard, { roles }) },
                React.createElement(Route, { path: '/users', element: React.createElement('span', null, 'PROTECTED_MANAGER_DATA') }))
        )));
}
test('guard waits for server verification before rendering protected children', () => {
    const html = renderGuard({ status: 'checking', user: { role: 1 } });
    assert.ok(html.includes('Проверка сессии'));
    assert.equal(html.includes('PROTECTED_MANAGER_DATA'), false);
});
test('guard denies worker access and permits verified manager', () => {
    const denied = renderGuard({ status: 'authenticated', user: { role: 2 } });
    assert.ok(denied.includes('Недостаточно прав'));
    assert.equal(denied.includes('PROTECTED_MANAGER_DATA'), false);
    assert.ok(renderGuard({ status: 'authenticated', user: { role: 1 } }).includes('PROTECTED_MANAGER_DATA'));
});
test('session errors offer retry and do not render protected children', () => {
    const html = renderGuard({ status: 'error', user: null, retrySession() {}, logout() {} });
    assert.ok(html.includes('Повторить'));
    assert.ok(html.includes('Выйти'));
    assert.equal(html.includes('PROTECTED_MANAGER_DATA'), false);
});

test('a verified page stays mounted during background checks and temporary errors', () => {
    const state = { status: 'authenticated', user: { id: 1, role: 1 }, isCheckingSession: true };
    const checking = renderGuard(state, null);
    assert.ok(checking.includes('PROTECTED_MANAGER_DATA'));
    assert.ok(checking.includes('Отправка изменений временно недоступна'));
    const failed = renderGuard({ ...state, isCheckingSession: false, sessionError: 'Временный отказ' }, null);
    assert.ok(failed.includes('PROTECTED_MANAGER_DATA'));
    assert.ok(failed.includes('Временный отказ'));
});

test('forbidden session closes the verified page', () => {
    const html = renderGuard({ status: 'forbidden', user: null });
    assert.ok(html.includes('Доступ запрещён'));
    assert.equal(html.includes('PROTECTED_MANAGER_DATA'), false);
});
