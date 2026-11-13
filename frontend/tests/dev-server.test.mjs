import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttpServer, request } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build, createServer, preview, resolveConfig } from 'vite';

// Real Vite, synthetic files and a loopback-only API. Never call the working backend.
const configFile = resolve('vite.config.ts');
const silent = { logLevel: 'silent' };

function get(port, path, headers = {}) {
    return new Promise((resolveResponse, reject) => {
        const req = request({ host: '127.0.0.1', port, path, headers, timeout: 5000 }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => resolveResponse({ status: res.statusCode, headers: res.headers, body }));
            res.on('error', reject);
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('Synthetic HTTP request timed out')));
        req.end();
    });
}

function message(socket, accepts) {
    return new Promise((resolveMessage, reject) => {
        const cleanup = () => {
            clearTimeout(timer);
            socket.removeEventListener('message', onMessage);
            socket.removeEventListener('error', onError);
        };
        const timer = setTimeout(() => { cleanup(); reject(new Error('Synthetic HMR message timed out')); }, 10000);
        const onError = () => { cleanup(); reject(new Error('Synthetic HMR connection failed')); };
        const onMessage = ({ data }) => {
            const value = JSON.parse(data);
            if (accepts(value)) { cleanup(); resolveMessage(value); }
        };
        socket.addEventListener('message', onMessage);
        socket.addEventListener('error', onError);
    });
}

async function closeHttp(server) {
    const closing = new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
    server.closeAllConnections();
    await closing;
}

test('local Vite dev/preview, proxy, HMR and file boundaries', { timeout: 60000 }, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'itrum-vite-boundaries-'));
    const root = join(directory, 'site');
    await mkdir(root);
    await writeFile(join(root, 'index.html'), '<!doctype html><p>Synthetic SPA</p><script type="module" src="/main.js"></script>');
    await writeFile(join(root, 'main.js'), 'export const value = 1; if (import.meta.hot) import.meta.hot.accept();');
    const outside = join(directory, 'outside.txt');
    const outsideHtml = join(directory, 'outside.html');
    await writeFile(outside, 'synthetic-outside-file');
    await writeFile(outsideHtml, '<p>synthetic-outside-html</p>');

    const received = [];
    const backend = createHttpServer((req, res) => {
        received.push({ url: req.url, authorization: req.headers.authorization, cookie: req.headers.cookie });
        const status = Number(new URL(req.url, 'http://synthetic').searchParams.get('status')) || 200;
        res.writeHead(status, { 'Content-Type': 'application/json', ...(status === 429 ? { 'Retry-After': '900' } : {}) });
        res.end(JSON.stringify({ synthetic: true }));
    });
    backend.listen(0, '127.0.0.1');
    await once(backend, 'listening');
    const previousTarget = process.env.API_PROXY_TARGET;
    process.env.API_PROXY_TARGET = `http://127.0.0.1:${backend.address().port}`;
    let dev;
    let staticServer;
    let socket;
    t.after(async () => {
        socket?.close();
        try {
            await dev?.close();
            if (staticServer) await closeHttp(staticServer.httpServer);
            await closeHttp(backend);
        } finally {
            if (previousTarget === undefined) delete process.env.API_PROXY_TARGET;
            else process.env.API_PROXY_TARGET = previousTarget;
            await rm(directory, { recursive: true, force: true });
        }
    });

    await t.test('defaults bind to loopback and explicit container host remains supported', async () => {
        const defaults = await resolveConfig({ configFile, ...silent }, 'serve');
        assert.equal(defaults.server.host, '127.0.0.1');
        assert.equal(defaults.preview.host, '127.0.0.1');
        assert.notEqual(defaults.server.allowedHosts, true);
        const container = await resolveConfig({ configFile, server: { host: '0.0.0.0' }, ...silent }, 'serve');
        assert.equal(container.server.host, '0.0.0.0');
    });

    dev = await createServer({ configFile, root, server: { port: 0, fs: { allow: [root] } }, ...silent });
    await dev.listen();
    const port = dev.httpServer.address().port;

    await t.test('dev serves SPA and rejects an untrusted Host', async () => {
        assert.equal(dev.httpServer.address().address, '127.0.0.1');
        assert.equal((await get(port, '/teams')).status, 200);
        assert.ok((await get(port, '/teams')).body.includes('Synthetic SPA'));
        assert.equal((await get(port, '/', { Host: 'untrusted.invalid' })).status, 403);
        const before = received.length;
        assert.ok((await get(port, '/api-other')).body.includes('Synthetic SPA'));
        assert.equal(received.length, before);
    });

    async function checkProxy(port) {
        for (const prefix of ['/api/', '/api/auth/protected', '/api-docs/']) {
            for (const status of [200, 401, 403, 404, 429]) {
                const path = `${prefix}?status=${status}`;
                const result = await get(port, path, { Authorization: 'Bearer synthetic-session', Cookie: 'token=synthetic-cookie' });
                assert.equal(result.status, status);
                assert.deepEqual(JSON.parse(result.body), { synthetic: true });
                assert.deepEqual(received.at(-1), { url: path, authorization: 'Bearer synthetic-session', cookie: 'token=synthetic-cookie' });
                if (status === 429) assert.equal(result.headers['retry-after'], '900');
            }
        }
    }
    await t.test('dev proxy preserves API/Swagger paths, statuses and session headers', () => checkProxy(port));

    await t.test('HMR connects and reports an update from a synthetic module', async () => {
        await get(port, '/main.js');
        socket = new WebSocket(`ws://127.0.0.1:${port}/?token=${dev.config.webSocketToken}`, 'vite-hmr');
        await message(socket, (value) => value.type === 'connected');
        const updated = message(socket, (value) => value.type === 'update');
        await writeFile(join(root, 'main.js'), 'export const value = 2; if (import.meta.hot) import.meta.hot.accept();');
        const update = await updated;
        assert.ok(update.updates.some((entry) => entry.path === '/main.js'));
        socket.close();
    });

    await t.test('outside text/HTML stay blocked after a virtual-module injection attempt', async () => {
        const outsidePath = `/@fs${outside}?raw`;
        assert.equal((await get(port, outsidePath)).status, 403);
        assert.equal((await get(port, `/@fs${outsideHtml}`)).status, 403);
        assert.equal((await get(port, '/../outside.html')).body.includes('synthetic-outside-html'), false);
        // Harmless variant of GHSA-p4f5-76q4-ffq7: try to allow an artificial file;
        // no commands, real files or code execution payloads are used.
        const suffix = '`);}});\n' + `import '/@fs${outside}';\n` + 'var z=new Proxy({}, {get(_, key) {throw new Error(`';
        await get(port, `/@id/__vite-browser-external:${encodeURIComponent(suffix)}?import`);
        assert.equal((await get(port, outsidePath)).status, 403);
    });

    await build({ configFile, root, ...silent });
    staticServer = await preview({ configFile, root, preview: { port: 0 }, ...silent });
    const previewPort = staticServer.httpServer.address().port;
    await t.test('preview binds to loopback, serves SPA and preserves the proxy', async () => {
        assert.equal(staticServer.httpServer.address().address, '127.0.0.1');
        assert.ok((await get(previewPort, '/teams')).body.includes('Synthetic SPA'));
        assert.equal((await get(previewPort, '/', { Host: 'untrusted.invalid' })).status, 403);
        await checkProxy(previewPort);
        assert.equal((await get(previewPort, `/@fs${outsideHtml}`)).body.includes('synthetic-outside-html'), false);
        assert.equal((await get(previewPort, '/../../outside.html')).body.includes('synthetic-outside-html'), false);
    });
});
