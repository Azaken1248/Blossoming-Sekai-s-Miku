import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startDatabase } from '../support/database.js';

const KEY = 'a'.repeat(64);
const INTERNAL = 'E11000 duplicate key at mongodb+srv://admin:hunter2@cluster0.internal/sekai';

let database;
let app;
let User;
let generateCardImage;

before(async () => {
    process.env.API_KEY = KEY;
    for (const name of ['BOT_TOKEN', 'DISCORD_TOKEN', 'GUILD_ID', 'DISCORD_GUILD_ID', 'SERVER_GUILD_ID']) {
        Reflect.deleteProperty(process.env, name);
    }
    database = await startDatabase('sekai_api_masking');
    ({ default: app } = await import('../../API/app.js'));
    ({ default: User } = await import('../../DB/Schemas/user.js'));
    ({ generateCardImage } = await import('../../API/controllers/userController.js'));
});

beforeEach(() => database.reset());
after(() => database.stop());

const failWithInternalDetail = (t, method) => {
    t.mock.method(User, method, () => {
        throw new Error(INTERNAL);
    });
    return t.mock.method(console, 'error', () => {});
};

const assertLoggedNotLeaked = (response, errors, label) => {
    assert.equal(JSON.stringify(response.body).includes('hunter2'), false);
    assert.equal(response.text.includes('E11000'), false);
    assert.deepEqual(
        errors.mock.calls.map(({ arguments: [message, error] }) => [message, error.message]),
        [[label, INTERNAL]],
    );
};

test('GET /api/users answers a failure with a generic 500 and logs the real error', async (t) => {
    const errors = failWithInternalDetail(t, 'find');
    const response = await request(app).get('/api/users').expect(500);
    assert.deepEqual(response.body, { error: 'Failed to list users' });
    assertLoggedNotLeaked(response, errors, '[API] listUsers failed:');
});

test('GET /api/users still explains a search that is too long, with 400', async () => {
    const response = await request(app)
        .get('/api/users')
        .query({ search: 'x'.repeat(101) })
        .expect(400);
    assert.match(response.body.error, /100/);
});

test('POST /api/users answers a failure with a generic 500 and logs the real error', async (t) => {
    const errors = failWithInternalDetail(t, 'findOne');
    const response = await request(app)
        .post('/api/users')
        .set('x-api-key', KEY)
        .send({ discordId: '100000000000000001', username: 'member.one' })
        .expect(500);
    assert.deepEqual(response.body, { error: 'Failed to create user' });
    assertLoggedNotLeaked(response, errors, '[API] createUser failed:');
});

test('generateCardImage answers a failure with a generic 500 and logs the real error', async (t) => {
    const errors = failWithInternalDetail(t, 'findOne');
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
    await generateCardImage({ params: { discordId: '100000000000000001' } }, res);
    assert.deepEqual(outcome, { status: 500, body: { error: 'Failed to generate card image' } });
    assertLoggedNotLeaked(
        { body: outcome.body, text: JSON.stringify(outcome.body) },
        errors,
        'Error generating card image:',
    );
});
