import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startDatabase } from '../support/database.js';

const BASE = '/api/v1/analytics';
const INTERNAL = 'connect ECONNREFUSED mongodb://internal-host';

let database;
let app;
let Assignment;
let User;

before(async () => {
    database = await startDatabase('sekai_api_analytics');
    ({ default: app } = await import('../../API/app.ts'));
    ({ default: Assignment } = await import('../../DB/Schemas/assignment.ts'));
    ({ default: User } = await import('../../DB/Schemas/user.ts'));
});

beforeEach(() => database.reset());
after(() => database.stop());

const get = (path, query = {}) => request(app).get(`${BASE}${path}`).query(query);

const insertMembers = (count) =>
    database
        .db()
        .collection('users')
        .insertMany(
            Array.from({ length: count }, (_, index) => ({
                discordId: `10000000000000${String(index).padStart(4, '0')}`,
                username: `member.${index}`,
                assignments: [],
                joinedAt: new Date(Date.UTC(2026, 0, 1) + index * 1000),
            })),
        );

test('lists assignments with their member and the paging used', async () => {
    const user = await User.create({ discordId: '100000000000000001', username: 'member.one' });
    await Assignment.create({
        userId: user._id,
        discordUserId: user.discordId,
        roleCategoryId: '1',
        roleName: 'VA',
        taskType: 'skit',
        deadline: new Date('2026-07-01'),
    });
    const { body } = await get('/assignments', { status: 'PENDING' }).expect(200);
    assert.deepEqual([body.success, body.count, body.page, body.limit], [true, 1, 1, 100]);
    assert.equal(body.data[0].userId.username, 'member.one');
});

test('lists members newest first with a total, without their assignments', async () => {
    await insertMembers(3);
    const { body } = await get('/users').expect(200);
    assert.deepEqual([body.count, body.page, body.limit, body.total], [3, 1, 200, 3]);
    assert.deepEqual(
        body.data.map((user) => user.username),
        ['member.2', 'member.1', 'member.0'],
    );
    assert.equal('assignments' in body.data[0], false);
});

test('pages members and bounds the limit', async () => {
    await insertMembers(3);
    const { body } = await get('/users', { page: '2', limit: '2' }).expect(200);
    assert.deepEqual(
        body.data.map((user) => user.username),
        ['member.0'],
    );
    assert.equal((await get('/users', { limit: '9999', page: 'x' })).body.limit, 200);
    assert.equal((await get('/users', { limit: '-1' })).body.limit, 1);
});

test('counts assignments by status unless told otherwise, honouring filters', async () => {
    await database
        .db()
        .collection('assignments')
        .insertMany([
            { status: 'LATE', roleName: 'VA', hasExtended: true, firstReminderSent: true, extensionCount: 2 },
            { status: 'LATE', roleName: 'VA', hasExtended: false, firstReminderSent: false, extensionCount: 0 },
            { status: 'PENDING', roleName: 'Editor', hasExtended: false, firstReminderSent: false, extensionCount: 0 },
        ]);
    const { body } = await get('/stats').expect(200);
    assert.deepEqual(body, {
        success: true,
        groupBy: 'status',
        data: [
            { _id: 'LATE', totalTasks: 2, avgExtensions: 1, extendedTasks: 1, firstRemindersSent: 1 },
            { _id: 'PENDING', totalTasks: 1, avgExtensions: 0, extendedTasks: 0, firstRemindersSent: 0 },
        ],
    });
    const grouped = await get('/stats', { groupBy: 'roleName', status: 'PENDING' }).expect(200);
    assert.deepEqual(
        grouped.body.data.map(({ _id, totalTasks }) => [_id, totalTasks]),
        [['Editor', 1]],
    );
});

test('refuses grouping by a field that is not allowed', async () => {
    const { body } = await get('/stats', { groupBy: '$where' }).expect(400);
    assert.equal(
        body.error,
        'groupBy must be one of: status, roleName, roleCategoryId, taskType, discordUserId, hasExtended',
    );
});

test('explains a malformed filter with 400', async () => {
    const { body } = await get('/stats', { status: 'DONE' }).expect(400);
    assert.equal(body.error, 'status must be one of: PENDING, COMPLETED, LATE, EXCUSED');
});

for (const [path, model, method, label] of [
    ['/assignments', () => Assignment, 'find', 'assignments'],
    ['/users', () => User, 'find', 'users'],
    ['/stats', () => Assignment, 'aggregate', 'stats'],
]) {
    test(`${path} hides and logs an unexpected failure`, async (t) => {
        const errors = t.mock.method(console, 'error', () => {});
        t.mock.method(model(), method, () => {
            throw new Error(INTERNAL);
        });
        const { body } = await get(path).expect(500);
        assert.deepEqual(body, { error: `Failed to fetch ${label}` });
        assert.deepEqual(
            errors.mock.calls.map(({ arguments: [message, error] }) => [message, error.message]),
            [[`[API] ${label} failed:`, INTERNAL]],
        );
    });
}
