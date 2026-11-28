import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cors from 'cors';
import request from 'supertest';
import {
    DEFAULT_ALLOWED_ORIGINS,
    buildCorsOptions,
    describeCorsPolicy,
    isOriginAllowed,
    parseOriginList,
} from '../../API/corsPolicy.ts';

const useEnvironment = (t, values) => {
    const saved = Object.fromEntries(Object.keys(values).map((name) => [name, process.env[name]]));
    const apply = (entries) => {
        for (const [name, value] of Object.entries(entries)) {
            if (value === undefined) Reflect.deleteProperty(process.env, name);
            else process.env[name] = value;
        }
    };
    apply(values);
    t.after(() => apply(saved));
};

const serve = (options) => {
    const app = express();
    app.use(cors(buildCorsOptions(options)));
    app.get('/x', (_req, res) => res.json({ ok: true }));
    return app;
};

describe('parseOriginList', () => {
    test('splits, trims, drops trailing slashes and empty entries', () => {
        assert.deepEqual(parseOriginList(' https://a.example/ , ,https://b.example'), [
            'https://a.example',
            'https://b.example',
        ]);
        assert.deepEqual(parseOriginList(undefined), []);
        assert.deepEqual(parseOriginList(null), []);
    });
});

describe('isOriginAllowed', () => {
    test('lets requests without an Origin header through', () => {
        assert.equal(isOriginAllowed(undefined), true);
        assert.equal(isOriginAllowed(''), true);
    });

    test('allows only the default origin in production when nothing is configured', () => {
        assert.deepEqual(DEFAULT_ALLOWED_ORIGINS, ['https://sekai.azaken.com']);
        assert.equal(isOriginAllowed('https://sekai.azaken.com'), true);
        assert.equal(isOriginAllowed('https://sekai.azaken.com/'), true);
        assert.equal(isOriginAllowed('http://sekai.azaken.com'), false);
        assert.equal(isOriginAllowed('https://sekai.azaken.com.evil.example'), false);
        assert.equal(isOriginAllowed('https://evil.example'), false);
        assert.equal(isOriginAllowed('http://localhost:5173'), false);
    });

    test('replaces the default with CORS_ORIGINS when it is set', () => {
        const configured = 'https://staging.example';
        assert.equal(isOriginAllowed('https://staging.example', { configured }), true);
        assert.equal(isOriginAllowed('https://sekai.azaken.com', { configured }), false);
    });

    test('adds localhost on any port, and nothing else, outside production', () => {
        const dev = { isProduction: false };
        for (const origin of [
            'http://localhost',
            'http://localhost:5173',
            'https://127.0.0.1:65535',
            'http://[::1]:8080',
        ]) {
            assert.equal(isOriginAllowed(origin, dev), true, origin);
        }
        for (const origin of [
            'http://localhost.evil.example',
            'http://localhost:123456',
            'http://evil.example/localhost',
            'file://localhost',
            'http://localhost:',
        ]) {
            assert.equal(isOriginAllowed(origin, dev), false, origin);
        }
    });
});

describe('the cors middleware built from the policy', () => {
    test('answers an allowed origin with its CORS headers', async () => {
        const response = await request(serve({ isProduction: true }))
            .get('/x')
            .set('Origin', 'https://sekai.azaken.com')
            .expect(200);
        assert.equal(response.headers['access-control-allow-origin'], 'https://sekai.azaken.com');
    });

    test('serves a refused origin without CORS headers instead of failing', async () => {
        const response = await request(serve({ isProduction: true }))
            .get('/x')
            .set('Origin', 'https://evil.example')
            .expect(200);
        assert.equal(response.headers['access-control-allow-origin'], undefined);
    });

    test('allows only the declared methods and headers in a preflight, cached for a day', async () => {
        const response = await request(serve({ isProduction: true }))
            .options('/x')
            .set('Origin', 'https://sekai.azaken.com')
            .set('Access-Control-Request-Method', 'POST')
            .expect(204);
        assert.deepEqual(
            [
                response.headers['access-control-allow-methods'],
                response.headers['access-control-allow-headers'],
                response.headers['access-control-max-age'],
            ],
            ['GET,POST,DELETE,OPTIONS', 'Content-Type,x-api-key', '86400'],
        );
    });

    test('reads CORS_ORIGINS and NODE_ENV from the environment by default', async (t) => {
        useEnvironment(t, { CORS_ORIGINS: 'https://env.example', NODE_ENV: 'production' });
        const options = buildCorsOptions();
        const decide = (origin) =>
            new Promise((resolve) => options.origin(origin, (error, allowed) => resolve([error, allowed])));
        assert.deepEqual(
            [await decide('https://env.example'), await decide('http://localhost:3000')],
            [
                [null, true],
                [null, false],
            ],
        );
    });
});

describe('describeCorsPolicy', () => {
    test('names the allowed origins and where they came from', () => {
        assert.equal(
            describeCorsPolicy({ configured: '', isProduction: true }),
            '[CORS] Allowing https://sekai.azaken.com [from default]',
        );
        assert.equal(
            describeCorsPolicy({ configured: 'https://a.example,https://b.example', isProduction: false }),
            '[CORS] Allowing https://a.example, https://b.example (+ localhost, non-production) [from CORS_ORIGINS]',
        );
    });

    test('reads the environment by default', (t) => {
        useEnvironment(t, { CORS_ORIGINS: undefined, NODE_ENV: 'production' });
        assert.equal(describeCorsPolicy(), '[CORS] Allowing https://sekai.azaken.com [from default]');
    });
});
