import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startDatabase } from '../support/database.js';
import { reportApiKeyStatus, requireApiKey } from '../../API/middleware/requireApiKey.js';

const KEY = 'a'.repeat(64);
const MEMBER = '100000000000000001';
const TASK = '0123456789abcdef01234567';
const WRITE_ROUTES = [
    ['post', '/api/users'],
    ['post', `/api/users/${MEMBER}/strikes/add`],
    ['post', `/api/users/${MEMBER}/strikes/remove`],
    ['post', '/api/assignments'],
    ['post', `/api/assignments/${TASK}/complete`],
    ['post', `/api/assignments/${TASK}/extend`],
];

let database;
let app;
let savedKey;

before(async () => {
    savedKey = process.env.API_KEY;
    database = await startDatabase('sekai_api_auth');
    ({ default: app } = await import('../../API/app.js'));
});

beforeEach(async (t) => {
    process.env.API_KEY = KEY;
    t.mock.method(console, 'warn', () => {});
    t.mock.method(console, 'error', () => {});
    await database.reset();
});

after(async () => {
    process.env.API_KEY = savedKey;
    await database.stop();
});

const routerLayers = (stack) =>
    stack.flatMap((layer) => (layer.route ? [layer] : layer.handle?.stack ? routerLayers(layer.handle.stack) : []));

describe('write routes', () => {
    test('every route that is not a GET runs requireApiKey before its handler', () => {
        const unguarded = routerLayers(app._router.stack)
            .filter(({ route }) => Object.keys(route.methods).some((method) => method !== 'get'))
            .filter(({ route }) => route.stack[0]?.handle !== requireApiKey)
            .map(({ route }) => `${Object.keys(route.methods).join(',')} ${route.path}`);
        assert.deepEqual(unguarded, []);
    });

    test('the list below names every guarded route the app mounts', () => {
        const guarded = routerLayers(app._router.stack).filter(
            ({ route }) => route.stack[0]?.handle === requireApiKey,
        ).length;
        assert.equal(guarded, WRITE_ROUTES.length);
    });

    for (const [method, path] of WRITE_ROUTES) {
        test(`${method.toUpperCase()} ${path} is refused without a key`, async () => {
            const response = await request(app)[method](path).send({});
            assert.deepEqual([response.status, response.body], [401, { error: 'Unauthorized' }]);
        });

        test(`${method.toUpperCase()} ${path} is refused with a wrong key of the same length`, async () => {
            const response = await request(app)[method](path).set('x-api-key', 'b'.repeat(64)).send({});
            assert.equal(response.status, 401);
        });

        test(`${method.toUpperCase()} ${path} is refused with a key of another length`, async () => {
            const response = await request(app)[method](path).set('x-api-key', KEY.slice(1)).send({});
            assert.equal(response.status, 401);
        });

        test(`${method.toUpperCase()} ${path} passes the guard with the right key`, async () => {
            const response = await request(app)[method](path).set('x-api-key', KEY).send({});
            assert.ok(![401, 503].includes(response.status), `got ${response.status}`);
        });

        test(`${method.toUpperCase()} ${path} is disabled with 503 when no key is configured`, async () => {
            delete process.env.API_KEY;
            const response = await request(app)[method](path).set('x-api-key', '').send({});
            assert.deepEqual(
                [response.status, response.body],
                [503, { error: 'Write operations are disabled: the server has no API_KEY configured.' }],
            );
        });
    }

    test('reads stay open when no key is configured', async () => {
        delete process.env.API_KEY;
        await request(app).get('/api/users').expect(200);
    });
});

describe('requireApiKey', () => {
    const call = (headers, ip) => {
        const outcome = {};
        const res = {
            status(code) {
                outcome.status = code;
                return this;
            },
            json(body) {
                outcome.body = body;
                return this;
            },
        };
        const req = { method: 'POST', originalUrl: '/x', ip, get: (name) => headers[name] };
        requireApiKey(req, res, () => {
            outcome.next = true;
        });
        return outcome;
    };

    test('calls next only for the configured key', () => {
        assert.deepEqual(call({ 'x-api-key': KEY }), { next: true });
        assert.deepEqual(call({ 'x-api-key': 'nope' }, '203.0.113.9'), {
            status: 401,
            body: { error: 'Unauthorized' },
        });
    });

    test('logs who was refused, and "unknown" when the address is missing', () => {
        call({}, '203.0.113.9');
        call({});
        assert.deepEqual(
            console.warn.mock.calls.map((entry) => entry.arguments[0]),
            ['[AUTH] Unauthorized POST /x from 203.0.113.9', '[AUTH] Unauthorized POST /x from unknown'],
        );
    });
});

describe('reportApiKeyStatus', () => {
    test('warns how to create a key when none is set', (t) => {
        delete process.env.API_KEY;
        reportApiKeyStatus();
        assert.ok(console.warn.mock.calls.some((entry) => String(entry.arguments[0]).includes('API_KEY is not set')));
        assert.ok(console.warn.mock.calls.some((entry) => String(entry.arguments[0]).includes('randomBytes(32)')));
        t.mock.reset();
    });

    test('warns about a key shorter than 32 characters', () => {
        process.env.API_KEY = 'short';
        reportApiKeyStatus();
        assert.deepEqual(console.warn.mock.calls.at(-1).arguments, [
            '[AUTH] ⚠️  API_KEY is only 5 characters. At least 32 is recommended.',
        ]);
    });

    test('confirms a key of 32 characters or more', (t) => {
        const log = t.mock.method(console, 'log', () => {});
        process.env.API_KEY = 'c'.repeat(32);
        reportApiKeyStatus();
        assert.deepEqual(
            log.mock.calls.map((entry) => entry.arguments),
            [['[AUTH] ✅ API_KEY configured; write endpoints are protected.']],
        );
        assert.equal(console.warn.mock.calls.length, 0);
    });
});
