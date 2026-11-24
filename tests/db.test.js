import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import connectDB from '../DB/db.js';

test('connects with MONGO_URI and logs success', async (t) => {
    t.mock.method(console, 'log', () => {});
    const connect = t.mock.method(mongoose, 'connect', async () => mongoose);
    process.env.MONGO_URI = 'mongodb://db.example:27017/sekai';
    await connectDB();
    assert.deepEqual(
        connect.mock.calls.map((call) => call.arguments),
        [['mongodb://db.example:27017/sekai']],
    );
});

test('logs the failure and exits with status 1 when the connection fails', async (t) => {
    const errors = t.mock.method(console, 'error', () => {});
    const exit = t.mock.method(process, 'exit', () => {});
    t.mock.method(mongoose, 'connect', async () => {
        throw new Error('querySrv ENOTFOUND');
    });
    await connectDB();
    assert.deepEqual(
        errors.mock.calls.map((call) => call.arguments),
        [['MongoDB Connection Error:', 'querySrv ENOTFOUND']],
    );
    assert.deepEqual(
        exit.mock.calls.map((call) => call.arguments),
        [[1]],
    );
});
