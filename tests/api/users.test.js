import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startDatabase } from '../support/database.js';

let database;
let app;

before(async () => {
    process.env.API_KEY = 'k'.repeat(40);
    database = await startDatabase('sekai_api_users');
    ({ default: app } = await import('../../API/app.js'));
});

beforeEach(async () => {
    await database.reset();
});

after(async () => {
    await database.stop();
});

test('GET /api/users lists members from the database', async () => {
    await database.db().collection('users').insertOne({ discordId: '100000000000000001', username: 'member.one' });
    const response = await request(app).get('/api/users').expect(200);
    assert.equal(response.body.success, true);
    assert.deepEqual(
        response.body.data.map((user) => user.username),
        ['member.one'],
    );
});

test('POST /api/users without the key is refused', async () => {
    await request(app).post('/api/users').send({ discordId: '1', username: 'x' }).expect(401);
});
