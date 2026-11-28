import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

test('connects to the database and listens on the configured host and port', async (t) => {
    Object.assign(process.env, {
        MONGO_URI: 'mongodb://db.example:27017/sekai',
        PORT: '2019',
        HOST: '::1',
        API_KEY: 'k'.repeat(40),
        NODE_ENV: 'production',
        CORS_ORIGINS: '',
    });
    mock.module('dotenv', { exports: { default: { config: () => ({ parsed: {} }) } } });
    const connect = t.mock.method(mongoose, 'connect', async () => mongoose);
    const log = t.mock.method(console, 'log', () => {});
    const { default: app } = await import('../../API/app.ts');
    const listen = t.mock.method(app, 'listen', () => {});

    await import('../../API/api.js');

    assert.equal(connect.mock.callCount(), 1);
    assert.equal(listen.mock.callCount(), 1);
    const [port, host, onListening] = listen.mock.calls[0].arguments;
    assert.deepEqual([port, host], [2019, '::1']);

    log.mock.resetCalls();
    onListening();
    assert.deepEqual(
        log.mock.calls.map((call) => call.arguments[0]),
        [
            'API Server running strictly as an API on http://[::1]:2019',
            '[CORS] Allowing https://sekai.azaken.com [from default]',
            '[AUTH] ✅ API_KEY configured; write endpoints are protected.',
        ],
    );
});
