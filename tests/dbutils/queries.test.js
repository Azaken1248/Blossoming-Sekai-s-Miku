import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { startDatabase } from '../support/database.js';

let database;
let User;
let Assignment;
let taskUtils;
let userUtils;

before(async () => {
    database = await startDatabase('sekai_dbutils');
    User = (await import('../../DB/Schemas/user.js')).default;
    Assignment = (await import('../../DB/Schemas/assignment.js')).default;
    taskUtils = await import('../../Utils/DBUtils/taskUtils.js');
    userUtils = await import('../../Utils/DBUtils/userUtils.js');
});

beforeEach(() => database.reset());
after(() => database.stop());

const member = (discordId, username, extra = {}) =>
    User.create({ discordId, username, joinedAt: new Date('2026-01-01T00:00:00Z'), ...extra });

const task = (user, overrides = {}) =>
    Assignment.create({
        userId: user._id,
        discordUserId: user.discordId,
        roleCategoryId: '1',
        roleName: 'VA',
        taskType: 'skit',
        deadline: new Date('2026-07-01T00:00:00Z'),
        ...overrides,
    });

test('fetchPendingTask returns the pending task due soonest, or null', async () => {
    const va = await member('11', 'va');
    await task(va, { taskName: 'later', deadline: new Date('2026-08-01T00:00:00Z') });
    await task(va, { taskName: 'sooner', deadline: new Date('2026-07-01T00:00:00Z') });
    await task(va, { taskName: 'done', status: 'COMPLETED', deadline: new Date('2026-06-01T00:00:00Z') });
    assert.equal((await taskUtils.fetchPendingTask('11')).taskName, 'sooner');
    assert.equal(await taskUtils.fetchPendingTask('99'), null);
    await member('12', 'idle');
    assert.equal(await taskUtils.fetchPendingTask('12'), null);
});

test('extendAssignment refuses a non-positive or non-finite length', async () => {
    for (const length of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
        await assert.rejects(taskUtils.extendAssignment('0123456789abcdef01234567', length), {
            message: 'INVALID_EXTENSION',
        });
    }
});

test('reactivateUser keeps the stored username when none is given', async () => {
    await member('21', 'kept', { isDeboarded: true, deboarded_at: new Date() });
    const restored = await userUtils.reactivateUser('21');
    assert.deepEqual(
        { username: restored.username, isDeboarded: restored.isDeboarded, deboarded_at: restored.deboarded_at },
        { username: 'kept', isDeboarded: false, deboarded_at: null },
    );
    assert.equal((await userUtils.reactivateUser('21', 'renamed')).username, 'renamed');
});

test('listUsers searches username and id literally, newest first, with a bounded limit', async () => {
    await member('31', 'alpha.one', { joinedAt: new Date('2026-01-01T00:00:00Z') });
    await member('32', 'alphaxone', { joinedAt: new Date('2026-02-01T00:00:00Z') });
    await member('4331', 'beta', { joinedAt: new Date('2026-03-01T00:00:00Z') });
    const names = (users) => users.map((user) => user.username);
    assert.deepEqual(names(await userUtils.listUsers()), ['beta', 'alphaxone', 'alpha.one']);
    assert.deepEqual(names(await userUtils.listUsers({ search: '  alpha.  ' })), ['alpha.one']);
    assert.deepEqual(names(await userUtils.listUsers({ search: '31' })), ['beta', 'alpha.one']);
    assert.deepEqual(names(await userUtils.listUsers({ search: null })), ['beta', 'alphaxone', 'alpha.one']);
    assert.deepEqual(names(await userUtils.listUsers({ limit: 1 })), ['beta']);
    assert.equal((await userUtils.listUsers({ limit: 0 })).length, 3);
    assert.equal((await userUtils.listUsers({ limit: 'abc' })).length, 3);
    assert.equal((await userUtils.listUsers({ limit: -5 })).length, 1);
    assert.deepEqual(Object.keys((await userUtils.listUsers({ limit: 1 }))[0]).sort(), [
        '_id',
        'discordId',
        'isOnHiatus',
        'joinedAt',
        'roles',
        'strikes',
        'username',
    ]);
});

test('listUsers returns 100 members by default and never more than 500', async () => {
    await User.insertMany(
        Array.from({ length: 501 }, (_, index) => ({
            discordId: `5${String(index).padStart(17, '0')}`,
            username: `bulk.${index}`,
        })),
    );
    assert.equal((await userUtils.listUsers()).length, 100);
    assert.equal((await userUtils.listUsers({ limit: 0 })).length, 100);
    assert.equal((await userUtils.listUsers({ limit: 'abc' })).length, 100);
    assert.equal((await userUtils.listUsers({ limit: 500 })).length, 500);
    assert.equal((await userUtils.listUsers({ limit: 501 })).length, 500);
});
