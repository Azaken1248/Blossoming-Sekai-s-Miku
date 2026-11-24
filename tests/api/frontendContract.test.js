import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startDatabase } from '../support/database.js';

const ORIGIN = 'https://sekai.azaken.com';
const ANALYTICS = '/api/v1/analytics';
const MEMBER = '100000000000000001';
const DISCORD_VARIABLES = ['BOT_TOKEN', 'DISCORD_TOKEN', 'GUILD_ID', 'DISCORD_GUILD_ID', 'SERVER_GUILD_ID'];

let database;
let app;
let User;
let Assignment;

before(async () => {
    for (const name of DISCORD_VARIABLES) Reflect.deleteProperty(process.env, name);
    database = await startDatabase('sekai_api_contract');
    ({ default: app } = await import('../../API/app.js'));
    ({ default: User } = await import('../../DB/Schemas/user.js'));
    ({ default: Assignment } = await import('../../DB/Schemas/assignment.js'));
});

beforeEach(() => database.reset());
after(() => database.stop());

const seedMember = async () => {
    const user = await User.create({ discordId: MEMBER, username: 'member.one', strikes: 1 });
    const task = await Assignment.create({
        userId: user._id,
        discordUserId: MEMBER,
        roleCategoryId: '1',
        roleName: 'VA',
        taskType: 'skit',
        status: 'COMPLETED',
        deadline: new Date('2026-07-01'),
    });
    await User.updateOne({ _id: user._id }, { $push: { assignments: task._id } });
};

const read = async (t, path) => {
    t.mock.method(globalThis, 'fetch', async () => {
        throw new Error('the API must not call Discord in this test');
    });
    const response = await request(app).get(path).set('Origin', ORIGIN).expect(200);
    assert.equal(response.headers['access-control-allow-origin'], ORIGIN);
    assert.equal(response.body.success, true);
    return response.body.data;
};

const assertFields = (record, fields) => {
    const missing = fields.filter((field) => !(field in record));
    assert.deepEqual(missing, []);
};

describe('analytics page', () => {
    for (const query of [
        'sort=-createdAt',
        'sort=createdAt',
        'status=PENDING&taskType=skit&hasExtended=false&sort=-createdAt',
        'status=EXCUSED&hasExtended=true&sort=createdAt',
        'status=PENDING',
    ]) {
        test(`accepts the assignment request ${query}`, async (t) => {
            assert.ok(Array.isArray(await read(t, `${ANALYTICS}/assignments?${query}`)));
        });
    }

    test('gets every assignment field the table reads', async (t) => {
        await seedMember();
        const [task] = await read(t, `${ANALYTICS}/assignments?sort=-createdAt`);
        assertFields(task, [
            'taskType',
            'roleName',
            'discordUserId',
            'status',
            'deadline',
            'extensionCount',
            'hasExtended',
        ]);
        assertFields(task.userId, ['username', 'isOnHiatus']);
    });

    test('gets 100 assignments without asking for a limit', async (t) => {
        await database
            .db()
            .collection('assignments')
            .insertMany(Array.from({ length: 101 }, (_, index) => ({ taskName: `task ${index}` })));
        assert.equal((await read(t, `${ANALYTICS}/assignments?sort=-createdAt`)).length, 100);
    });

    test('gets every member field the roster reads', async (t) => {
        await seedMember();
        const [member] = await read(t, `${ANALYTICS}/users`);
        assertFields(member, ['discordId', 'username', 'strikes', 'isOnHiatus']);
    });

    test('gets up to 200 members without asking for a limit', async (t) => {
        await User.insertMany(
            Array.from({ length: 201 }, (_, index) => ({
                discordId: `2${String(index).padStart(17, '0')}`,
                username: `member.${index}`,
            })),
        );
        assert.equal((await read(t, `${ANALYTICS}/users`)).length, 200);
    });

    for (const groupBy of ['status', 'roleName', 'taskType']) {
        test(`gets statistics grouped by ${groupBy}`, async (t) => {
            await seedMember();
            const [group] = await read(t, `${ANALYTICS}/stats?groupBy=${groupBy}`);
            assertFields(group, ['_id', 'totalTasks', 'extendedTasks']);
        });
    }
});

describe('members page', () => {
    test('gets the member list it searches and links from', async (t) => {
        await seedMember();
        const [member] = await read(t, '/api/users?live=true');
        assertFields(member, ['discordId', 'username', 'actualRoles', 'strikes', 'isOnHiatus', 'joinedAt']);
    });

    test('gets every summary field the id card reads', async (t) => {
        await seedMember();
        const summary = await read(t, `/api/users/${MEMBER}/summary`);
        assertFields(summary, [
            'discordId',
            'username',
            'avatarUrl',
            'actualRoles',
            'mikuDescription',
            'isDeboarded',
            'isOnHiatus',
            'strikes',
            'topTaskRoles',
            'tasksCompleted',
            'joinedAt',
        ]);
    });
});
