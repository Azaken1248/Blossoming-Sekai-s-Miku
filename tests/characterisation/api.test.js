import { after, before, beforeEach, describe, mock, snapshot, test } from 'node:test';
import request from 'supertest';
import { startDatabase } from '../support/database.js';

const NOW = Date.parse('2026-06-15T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const KEY = 'k'.repeat(40);
const MEMBER = '100000000000000003';
const OTHER = '100000000000000004';
const MISSING_ID = '0123456789abcdef01234567';
const VA = '1449411540351713503';
const OBJECT_ID = /(?<![0-9a-f])[0-9a-f]{24}(?![0-9a-f])/g;
const DISCORD_VARIABLES = ['BOT_TOKEN', 'DISCORD_TOKEN', 'GUILD_ID', 'DISCORD_GUILD_ID', 'SERVER_GUILD_ID'];

snapshot.setDefaultSnapshotSerializers([(value) => JSON.stringify(value, null, 2)]);

const sortKeys = (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
        : value;

let database;
let app;
let User;
let Assignment;

before(async () => {
    for (const name of DISCORD_VARIABLES) Reflect.deleteProperty(process.env, name);
    process.env.API_KEY = KEY;
    mock.timers.enable({ apis: ['Date'], now: NOW });
    mock.method(globalThis, 'fetch', async () => {
        throw new Error('the API must not call out in this test');
    });
    database = await startDatabase('sekai_char_api');
    ({ default: app } = await import('../../API/app.js'));
    ({ default: User } = await import('../../DB/Schemas/user.ts'));
    ({ default: Assignment } = await import('../../DB/Schemas/assignment.ts'));
});

beforeEach(async () => {
    await database.reset();
    await User.create({ discordId: MEMBER, username: 'va.one', joinedAt: new Date('2026-01-10') });
    await User.create({ discordId: OTHER, username: 'editor.one', joinedAt: new Date('2026-01-11'), strikes: 3 });
});

after(() => database.stop());

const seedTask = async (overrides = {}) => {
    const user = await User.findOne({ discordId: MEMBER });
    const task = await Assignment.create({
        userId: user._id,
        discordUserId: MEMBER,
        roleCategoryId: VA,
        roleName: 'VA',
        taskType: 'skit',
        taskName: 'Morning skit',
        assignedAt: new Date(NOW - 3 * DAY),
        deadline: new Date(NOW + 11 * DAY),
        ...overrides,
    });
    await User.updateOne({ _id: user._id }, { $push: { assignments: task._id } });
    return task._id.toString();
};

const send = (method, path, body) => {
    const call = request(app)[method](path).set('x-api-key', KEY);
    return body === undefined ? call : call.send(body);
};

const record = async (t, call) => {
    const errors = t.mock.method(console, 'error', () => {});
    const response = await call;
    const users = await User.collection.find({}).sort({ discordId: 1 }).toArray();
    const assignments = await Assignment.collection.find({}).sort({ assignedAt: 1, taskName: 1 }).toArray();
    const raw = {
        status: response.status,
        type: response.headers['content-type'],
        body: response.type === 'application/json' ? response.body : response.text,
        errors: errors.mock.calls.map(({ arguments: args }) => args.map((arg) => arg?.name ?? String(arg))),
        database: { users, assignments },
    };
    const ids = new Map();
    const text = JSON.stringify(JSON.parse(JSON.stringify(raw)), sortKeys).replace(OBJECT_ID, (hex) => {
        if (hex === MISSING_ID) return hex;
        if (!ids.has(hex)) ids.set(hex, `<id ${ids.size + 1}>`);
        return ids.get(hex);
    });
    t.assert.snapshot(JSON.parse(text));
};

const scenario = (name, run) => test(name, (t) => record(t, run(t)));

describe('POST /api/users', () => {
    scenario('creates a member, trimming the username', () =>
        send('post', '/api/users', { discordId: '100000000000000009', username: '  new.one ' }),
    );
    scenario('returns an existing member unchanged', () =>
        send('post', '/api/users', { discordId: MEMBER, username: 'renamed' }),
    );
    scenario('accepts a numeric-looking id as text', () =>
        send('post', '/api/users', { discordId: '99999999999999999', username: 'edge' }),
    );
    scenario('refuses a body with nothing in it', () => send('post', '/api/users'));
    scenario('refuses an id that is not a snowflake', () =>
        send('post', '/api/users', { discordId: '123', username: 'x' }),
    );
    scenario('refuses a blank username', () => send('post', '/api/users', { discordId: MEMBER, username: '   ' }));
    scenario('refuses a username over 100 characters', () =>
        send('post', '/api/users', { discordId: MEMBER, username: 'x'.repeat(101) }),
    );
});

describe('GET /api/users', () => {
    scenario('lists members', () => send('get', '/api/users'));
    scenario('searches and limits', () => send('get', '/api/users?search=EDITOR&limit=1'));
    scenario('ignores the live flag', () => send('get', '/api/users?live=true'));
});

describe('GET /api/users/:discordId', () => {
    scenario('returns a member with their tasks', async () => {
        await seedTask();
        return send('get', `/api/users/${MEMBER}`);
    });
    scenario('returns a legacy member with no assignments field', async () => {
        await User.collection.updateOne({ discordId: MEMBER }, { $unset: { assignments: '', strikes: '' } });
        return send('get', `/api/users/${MEMBER}`);
    });
    scenario('reports a missing member', () => send('get', '/api/users/999'));
    scenario('hides a failure', (t) => {
        t.mock.method(User, 'findOne', () => {
            throw new Error('down');
        });
        return send('get', `/api/users/${MEMBER}`);
    });
});

describe('GET /api/users/:discordId/summary and share pages', () => {
    for (const path of [
        `/api/users/${MEMBER}/summary`,
        '/api/users/999/summary',
        `/api/users/share/${MEMBER}`,
        '/api/users/share/999',
    ]) {
        scenario(`GET ${path}`, async () => {
            await seedTask({ status: 'COMPLETED' });
            return send('get', path).set('Host', 'api.test');
        });
    }
    scenario('share page of a member on hiatus with strikes and roles, escaped', async () => {
        await User.updateOne(
            { discordId: MEMBER },
            { strikes: 2, isOnHiatus: true, username: '<b>"va"</b>', roles: ['A&B', 'C'] },
        );
        return send('get', `/api/users/share/${MEMBER}`);
    });
});

describe('strikes', () => {
    scenario('adds a strike', () => send('post', `/api/users/${MEMBER}/strikes/add`));
    scenario('does not go past three', () => send('post', `/api/users/${OTHER}/strikes/add`));
    scenario('reports a missing member when adding', () => send('post', '/api/users/999/strikes/add'));
    scenario('removes a strike', () => send('post', `/api/users/${OTHER}/strikes/remove`));
    scenario('does not go below zero', () => send('post', `/api/users/${MEMBER}/strikes/remove`));
    scenario('reports a missing member when removing', () => send('post', '/api/users/999/strikes/remove'));
    for (const action of ['add', 'remove']) {
        scenario(`hides a failure when asked to ${action}`, (t) => {
            t.mock.method(User, 'findOneAndUpdate', () => {
                throw new Error('down');
            });
            return send('post', `/api/users/${MEMBER}/strikes/${action}`);
        });
    }
});

describe('POST /api/assignments', () => {
    const body = { discordId: MEMBER, roleCategoryId: VA, taskType: 'skit', deadlineHours: 48 };
    const create = (changes) => send('post', '/api/assignments', { ...body, ...changes });

    scenario('creates a task with defaults', () => create({}));
    scenario('creates a task with every field', () =>
        create({ roleName: 'Lead VA', taskName: 'Named', description: 'Notes', deadlineHours: '0.5' }),
    );
    scenario('lists the missing fields', () => send('post', '/api/assignments'));
    scenario('refuses an id that is not a snowflake', () => create({ discordId: 'abc' }));
    scenario('refuses a zero deadline', () => create({ deadlineHours: 0 }));
    scenario('refuses a deadline over a year', () => create({ deadlineHours: 8761 }));
    scenario('refuses an unknown role', () => create({ roleCategoryId: '1' }));
    scenario('refuses a member with no record', () => create({ discordId: '100000000000000099' }));
    scenario('refuses a deboarded member', async () => {
        await User.updateOne({ discordId: MEMBER }, { isDeboarded: true });
        return create({});
    });
    scenario('hides a failure', (t) => {
        t.mock.method(User, 'findOne', () => {
            throw new Error('down');
        });
        return create({});
    });
});

describe('POST /api/assignments/:taskId/complete', () => {
    for (const status of ['PENDING', 'LATE', 'COMPLETED', 'EXCUSED']) {
        scenario(`of a ${status} task`, async () =>
            send('post', `/api/assignments/${await seedTask({ status })}/complete`),
        );
    }
    scenario('reports a missing task', () => send('post', `/api/assignments/${MISSING_ID}/complete`));
    scenario('refuses a malformed id', () => send('post', '/api/assignments/nope/complete'));
    scenario('hides a failure', (t) => {
        t.mock.method(Assignment, 'findOneAndUpdate', () => {
            throw new Error('down');
        });
        return send('post', `/api/assignments/${MISSING_ID}/complete`);
    });
});

describe('POST /api/assignments/:taskId/extend', () => {
    const extend = (id, extensionHours) => send('post', `/api/assignments/${id}/extend`, { extensionHours });

    for (const [name, overrides] of [
        ['a new task', {}],
        ['a task extended once', { hasExtended: true, extensionCount: 1 }],
        ['a legacy task that only has the flag', { hasExtended: true, extensionCount: 0 }],
        ['a task extended twice', { hasExtended: true, extensionCount: 2 }],
        ['a completed task', { status: 'COMPLETED' }],
        ['a late task', { status: 'LATE', deadline: new Date(NOW - DAY) }],
    ]) {
        scenario(`of ${name}`, async () => extend(await seedTask(overrides), 24));
    }
    scenario('refuses a missing length', async () => send('post', `/api/assignments/${await seedTask()}/extend`));
    scenario('refuses a length over a year', async () => extend(await seedTask(), 8761));
    scenario('reports a missing task', () => extend(MISSING_ID, 24));
    scenario('reports a task changed by another request', async (t) => {
        const id = await seedTask();
        t.mock.method(Assignment, 'findOneAndUpdate', () => ({ lean: async () => null }));
        return extend(id, 24);
    });
    scenario('refuses a malformed id', () => extend('nope', 24));
});

describe('GET /api/assignments', () => {
    scenario('pending task due soonest', async () => {
        await seedTask({ taskName: 'Later', deadline: new Date(NOW + 20 * DAY) });
        await seedTask();
        return send('get', `/api/assignments/pending/${MEMBER}`);
    });
    scenario('no pending task', () => send('get', `/api/assignments/pending/${MEMBER}`));
    scenario('pending task of a missing member', () => send('get', '/api/assignments/pending/999'));
    scenario('overdue tasks, with and without a member record', async () => {
        await seedTask({ deadline: new Date(NOW - DAY) });
        await seedTask({ taskName: 'Orphan', deadline: new Date(NOW - 2 * DAY), userId: MISSING_ID });
        await seedTask({ taskName: 'Due now', deadline: new Date(NOW) });
        return send('get', '/api/assignments/overdue');
    });
    for (const path of [`pending/${MEMBER}`, 'overdue']) {
        scenario(`hides a failure of ${path}`, (t) => {
            for (const model of [User, Assignment]) {
                t.mock.method(model, 'findOne', () => {
                    throw new Error('down');
                });
            }
            t.mock.method(Assignment, 'find', () => {
                throw new Error('down');
            });
            return send('get', `/api/assignments/${path}`);
        });
    }
});

describe('analytics', () => {
    for (const path of ['assignments?sort=-createdAt', 'users', 'stats?groupBy=status', 'assignments?status=NOPE']) {
        scenario(`GET ${path}`, async () => {
            await seedTask();
            return send('get', `/api/v1/analytics/${path}`);
        });
    }
});
