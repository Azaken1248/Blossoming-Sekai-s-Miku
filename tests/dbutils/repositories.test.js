import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startDatabase } from '../support/database.js';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MISSING = '0123456789abcdef01234567';
const ROUNDS = 12;
const at = (offset) => new Date(NOW.getTime() + offset);

let database;
let User;
let Assignment;
let tasks;
let members;
let aborted;

before(async () => {
    database = await startDatabase('sekai_repositories');
    User = (await import('../../DB/Schemas/user.ts')).default;
    Assignment = (await import('../../DB/Schemas/assignment.ts')).default;
    await Promise.all([User.init(), Assignment.init()]);
    const { createTaskRepository } = await import('../../Utils/DBUtils/taskRepository.ts');
    const { createMemberRepository } = await import('../../Utils/DBUtils/memberRepository.ts');
    const { createTransactionRunner } = await import('../../Utils/DBUtils/transaction.ts');
    const dependencies = {
        tasks: Assignment,
        members: User,
        transaction: createTransactionRunner(mongoose.connection),
        clock: { now: () => NOW },
    };
    tasks = createTaskRepository(dependencies);
    members = createMemberRepository(dependencies);
    const abortAtEnd = (work) =>
        dependencies.transaction(async (session) => {
            await work(session);
            throw new Error('commit refused');
        });
    aborted = {
        tasks: createTaskRepository({ ...dependencies, transaction: abortAtEnd }),
        members: createMemberRepository({ ...dependencies, transaction: abortAtEnd }),
    };
});

beforeEach(() => database.reset());
after(() => database.stop());

const member = (discordId = '11', extra = {}) =>
    User.create({ discordId, username: `member.${discordId}`, joinedAt: at(-30 * DAY), ...extra });

const task = async (user, overrides = {}) => {
    const created = await Assignment.create({
        userId: user._id,
        discordUserId: user.discordId,
        roleCategoryId: '1',
        roleName: 'VA',
        taskType: 'skit',
        assignedAt: at(-3 * DAY),
        deadline: at(5 * DAY),
        ...overrides,
    });
    await User.updateOne({ _id: user._id }, { $push: { assignments: created._id } });
    return created._id.toString();
};

const stored = (id) => Assignment.findById(id).lean();
const storedMember = (discordId = '11') => User.findOne({ discordId }).lean();
const dump = async () =>
    JSON.stringify([await User.find().sort('_id').lean(), await Assignment.find().sort('_id').lean()]);

const failing = (t, model, method) =>
    t.mock.method(model, method, () => {
        throw new Error('write failed');
    });

const assertPlain = (value) => {
    assert.equal(Object.getPrototypeOf(value), Object.prototype);
    assert.equal(typeof value.id, 'string');
    assert.equal('_id' in value, false);
};

const newTask = (user, extra = {}) => ({
    memberId: user._id.toString(),
    discordUserId: user.discordId,
    roleCategoryId: '1',
    roleName: 'VA',
    taskType: 'skit',
    deadline: at(DAY),
    ...extra,
});

describe('creating a task', () => {
    test('stores it, adds it to the member and returns plain data', async () => {
        const user = await member();
        const created = await tasks.create(newTask(user, { taskName: 'N', description: 'D', customExtension: DAY }));
        assertPlain(created);
        assert.deepEqual(created, {
            id: created.id,
            memberId: user._id.toString(),
            discordUserId: '11',
            roleCategoryId: '1',
            roleName: 'VA',
            taskType: 'skit',
            taskName: 'N',
            description: 'D',
            assignedAt: NOW,
            deadline: at(DAY),
            hasExtended: false,
            extensionCount: 0,
            customExtension: DAY,
            submissionChannelId: null,
            firstReminderSent: false,
            finalReminderSent: false,
            status: 'PENDING',
            completedAt: null,
        });
        assert.deepEqual((await storedMember()).assignments.map(String), [created.id]);
        const plain = await tasks.create(newTask(user));
        assert.deepEqual([plain.taskName, plain.description, plain.customExtension], ['', '', null]);
    });

    test('stores nothing when the member cannot be updated', async (t) => {
        const user = await member();
        const original = await dump();
        failing(t, User, 'updateOne');
        await assert.rejects(tasks.create(newTask(user)), /write failed/);
        t.mock.reset();
        assert.equal(await dump(), original);
    });

    test('stores nothing when the member is gone', async () => {
        await assert.rejects(tasks.create(newTask({ _id: MISSING, discordId: '9' })), { message: 'MEMBER_NOT_FOUND' });
        assert.equal(await Assignment.countDocuments(), 0);
    });
});

describe('reading tasks', () => {
    test('finds one by id with its member, and copes with a missing task or member', async () => {
        const user = await member();
        const found = await tasks.findById(await task(user));
        assertPlain(found);
        assertPlain(found.member);
        assert.deepEqual([found.memberId, found.member.username], [user._id.toString(), 'member.11']);
        const orphan = await tasks.findById(await task(user, { userId: MISSING }));
        assert.deepEqual([orphan.member, orphan.memberId], [null, '']);
        assert.equal(await tasks.findById(MISSING), null);
    });

    test('finds one by exact name or type for that member only', async () => {
        const user = await member();
        const named = await task(user, { taskName: 'Intro', taskType: 'story' });
        assert.equal((await tasks.findByIdentifier('11', 'Intro')).id, named);
        assert.equal((await tasks.findByIdentifier('11', 'story')).id, named);
        assert.equal(await tasks.findByIdentifier('11', 'intro'), null);
        assert.equal(await tasks.findByIdentifier('12', 'Intro'), null);
    });

    test('lists pending tasks, and overdue ones strictly before now', async () => {
        const user = await member();
        const overdue = await task(user, { deadline: at(-1) });
        await task(user, { deadline: NOW });
        await task(user, { deadline: at(-DAY), status: 'LATE' });
        const orphan = await task(user, { deadline: at(-DAY), userId: MISSING });
        assert.equal((await tasks.listPending()).length, 3);
        const listed = await tasks.listOverdue();
        assert.deepEqual(
            listed.map(({ id, member: owner }) => [id, owner?.discordId ?? null]).sort(),
            [
                [overdue, '11'],
                [orphan, null],
            ].sort(),
        );
    });

    test('history filters by member, text, status and role, newest first and limited', async () => {
        const user = await member();
        await task(user, { taskName: 'a.b', assignedAt: at(-1 * DAY) });
        await task(user, { taskName: 'axb', assignedAt: at(-2 * DAY), status: 'LATE', roleName: 'Editor' });
        await task(await member('12'), { taskName: 'other', assignedAt: at(-3 * DAY) });
        const names = async (filters) => (await tasks.listHistory(filters)).map(({ taskName }) => taskName);
        assert.deepEqual(await names(), ['a.b', 'axb', 'other']);
        assert.deepEqual(await names({ discordUserId: '12' }), ['other']);
        assert.deepEqual(await names({ taskName: 'A.B' }), ['a.b']);
        assert.deepEqual(await names({ status: 'late' }), ['axb']);
        assert.deepEqual(await names({ roleName: 'edit' }), ['axb']);
        assert.deepEqual(await names({ limit: 1 }), ['a.b']);
        assert.deepEqual(await names({ taskName: 'SKIT', limit: null }), ['a.b', 'axb', 'other']);
    });

    test('history returns 50 tasks by default', async () => {
        const user = await member();
        for (let index = 0; index < 51; index += 1) await task(user);
        assert.equal((await tasks.listHistory()).length, 50);
    });

    const THRESHOLDS = {
        SHORT_TASK: { duration: 7 * DAY, firstReminder: 2 * DAY, finalReminder: 12 * HOUR },
        MEDIUM_TASK: { duration: 14 * DAY, firstReminder: 4 * DAY, finalReminder: DAY },
        LONG_TASK: { firstReminder: 7 * DAY, finalReminder: 3 * DAY },
    };

    for (const [label, duration, remaining, sent, expected] of [
        ['short, at the first threshold', 7 * DAY, 2 * DAY, {}, 'first'],
        ['short, just before it', 7 * DAY, 2 * DAY + 1, {}, null],
        ['medium by one millisecond', 7 * DAY + 1, 4 * DAY, {}, 'first'],
        ['medium at its longest', 14 * DAY, 4 * DAY + 1, {}, null],
        ['long', 14 * DAY + 1, 7 * DAY, {}, 'first'],
        ['short, final', 7 * DAY, 12 * HOUR, { firstReminderSent: true }, 'final'],
        ['short, before final', 7 * DAY, 12 * HOUR + 1, { firstReminderSent: true }, null],
        ['both sent', 7 * DAY, HOUR, { firstReminderSent: true, finalReminderSent: true }, null],
        ['due this instant', 7 * DAY, 0, {}, null],
        ['not pending', 7 * DAY, HOUR, { status: 'LATE' }, null],
    ]) {
        test(`due reminders: ${label}`, async () => {
            const deadline = at(remaining);
            await task(await member(), { deadline, assignedAt: new Date(deadline.getTime() - duration), ...sent });
            const due = await tasks.listDueReminders(THRESHOLDS);
            assert.deepEqual(
                due.map(({ reminderType }) => reminderType),
                expected ? [expected] : [],
            );
            for (const { task: dueTask } of due) assertPlain(dueTask);
        });
    }

    test('fills defaults for legacy rows', async () => {
        const { insertedId } = await Assignment.collection.insertOne({
            userId: new mongoose.Types.ObjectId(),
            discordUserId: '11',
            roleCategoryId: '1',
            taskType: 'skit',
            deadline: at(DAY),
            status: 'PENDING',
        });
        const [legacy] = await tasks.listPending();
        assert.deepEqual(
            [legacy.roleName, legacy.taskName, legacy.description, legacy.extensionCount, legacy.completedAt],
            ['', '', '', 0, null],
        );
        assert.deepEqual(legacy.assignedAt, insertedId.getTimestamp());
        await Assignment.collection.updateOne({ _id: insertedId }, { $unset: { status: '' } });
        assert.equal((await tasks.findByIdentifier('11', 'skit')).status, 'PENDING');
        await User.collection.insertOne({ discordId: '11' });
        const person = await members.findByDiscordId('11');
        assert.deepEqual(
            [person.username, person.strikes, person.isOnHiatus, person.isDeboarded, person.deboardedAt, person.roles],
            [null, 0, false, false, null, []],
        );
        assert.match(person.deboardedMessage, /Scouted in a different SEKAI/);
        assert.deepEqual(await members.listFree(), [
            { discordId: '11', username: null, isOnHiatus: false, lastTask: null },
        ]);
        assert.deepEqual(await members.findAvailability('11'), {
            discordId: '11',
            username: null,
            isOnHiatus: false,
            isFree: true,
            activeTask: null,
            lastTask: null,
        });
        assert.deepEqual((await members.findProfile('11')).assignments, []);
        assert.equal(await members.addStrike('11'), 0);
    });
});

describe('single-task writes', () => {
    test('marks reminders and the submission channel', async () => {
        const id = await task(await member());
        await tasks.markReminderSent(id, 'first');
        assert.deepEqual([(await stored(id)).firstReminderSent, (await stored(id)).finalReminderSent], [true, false]);
        await tasks.markReminderSent(id, 'final');
        assert.equal((await stored(id)).finalReminderSent, true);
        await tasks.setSubmissionChannel(id, '700');
        assert.equal((await stored(id)).submissionChannelId, '700');
    });

    test('completes a pending or late task once', async () => {
        const user = await member();
        for (const status of ['PENDING', 'LATE']) {
            const id = await task(user, { status });
            const done = await tasks.complete(id);
            assertPlain(done);
            assert.deepEqual([done.status, done.completedAt], ['COMPLETED', NOW]);
            assert.equal(await tasks.complete(id), null);
        }
        assert.equal(await tasks.complete(await task(user, { status: 'EXCUSED' })), null);
    });

    test('extends up to twice, counting legacy rows as one', async () => {
        const id = await task(await member());
        const once = await tasks.extend(id, DAY);
        assert.deepEqual([once.extensionCount, once.hasExtended, once.deadline], [1, true, at(6 * DAY)]);
        assert.equal((await tasks.extend(id, DAY)).extensionCount, 2);
        await assert.rejects(tasks.extend(id, DAY), { message: 'ALREADY_EXTENDED' });
        const legacy = await task(await member('12'), { hasExtended: true });
        await Assignment.collection.updateOne(
            { _id: new mongoose.Types.ObjectId(legacy) },
            { $unset: { extensionCount: '' } },
        );
        assert.equal((await tasks.extend(legacy, DAY)).extensionCount, 2);
    });

    test('refuses unusable lengths and missing tasks', async () => {
        for (const length of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
            await assert.rejects(tasks.extend(MISSING, length), { message: 'INVALID_EXTENSION' });
        }
        await assert.rejects(tasks.extend(MISSING, 1), { message: 'TASK_NOT_FOUND' });
        await assert.rejects(tasks.extend('nope', 1), { name: 'CastError' });
    });
});

describe('completing with a strike removed', () => {
    test('does both, never below zero, and only once', async () => {
        const user = await member('11', { strikes: 2 });
        const id = await task(user);
        const result = await tasks.completeAndForgive(id);
        assert.deepEqual([result.task.status, result.strikes], ['COMPLETED', 1]);
        assert.equal(await tasks.completeAndForgive(id), null);
        assert.equal((await storedMember()).strikes, 1);
        await User.updateOne({ discordId: '11' }, { strikes: 0 });
        assert.equal((await tasks.completeAndForgive(await task(user))).strikes, 0);
    });

    test('completes even when the member record is gone', async () => {
        const result = await tasks.completeAndForgive(await task(await member(), { userId: MISSING }));
        assert.deepEqual([result.task.status, result.strikes], ['COMPLETED', null]);
    });

    test('changes nothing when the strike cannot be removed', async (t) => {
        const id = await task(await member('11', { strikes: 1 }));
        const original = await dump();
        failing(t, User, 'findOneAndUpdate');
        await assert.rejects(tasks.completeAndForgive(id), /write failed/);
        assert.equal(await dump(), original);
    });
});

describe('marking late with a strike', () => {
    const overdue = async (extra = {}) => task(await member('11', extra), { deadline: at(-HOUR) });

    test('does both and stops at three strikes', async () => {
        const id = await overdue({ strikes: 2 });
        assert.deepEqual(await tasks.markLateAndStrike(id), { outcome: 'late', strikes: 3 });
        assert.equal((await stored(id)).status, 'LATE');
        const user = await storedMember();
        const again = await task(user, { deadline: at(-HOUR) });
        assert.deepEqual(await tasks.markLateAndStrike(again), { outcome: 'late', strikes: 3 });
    });

    test('skips a task that is no longer pending or no longer overdue', async () => {
        const id = await overdue();
        await tasks.complete(id);
        assert.deepEqual(await tasks.markLateAndStrike(id), { outcome: 'skipped' });
        assert.equal((await stored(id)).status, 'COMPLETED');
        const extended = await task(await storedMember(), { deadline: at(HOUR) });
        assert.deepEqual(await tasks.markLateAndStrike(extended), { outcome: 'skipped' });
        assert.equal((await storedMember()).strikes, 0);
    });

    test('keeps the task late when the member record is gone', async () => {
        const id = await task(await member(), { deadline: at(-HOUR), userId: MISSING });
        assert.deepEqual(await tasks.markLateAndStrike(id), { outcome: 'late', strikes: null });
        assert.equal((await stored(id)).status, 'LATE');
    });

    test('changes nothing when the strike cannot be added', async (t) => {
        const id = await overdue();
        const original = await dump();
        failing(t, User, 'findOneAndUpdate');
        await assert.rejects(tasks.markLateAndStrike(id), /write failed/);
        assert.equal(await dump(), original);
    });
});

describe('removing a task', () => {
    test('deletes it and detaches it', async () => {
        const user = await member();
        const kept = await task(user);
        assert.equal(await tasks.remove(await task(user)), 'removed');
        assert.deepEqual((await storedMember()).assignments.map(String), [kept]);
    });

    test('refuses a completed or missing task', async () => {
        const id = await task(await member(), { status: 'COMPLETED' });
        assert.equal(await tasks.remove(id), 'completed');
        assert.ok(await stored(id));
        assert.equal(await tasks.remove(MISSING), 'missing');
    });

    test('changes nothing when it cannot be detached', async (t) => {
        const id = await task(await member());
        const original = await dump();
        failing(t, User, 'updateOne');
        await assert.rejects(tasks.remove(id), /write failed/);
        t.mock.reset();
        assert.equal(await dump(), original);
    });
});

describe('members', () => {
    test('finds or creates', async (t) => {
        t.mock.method(console, 'log', () => {});
        const { member: made, created } = await members.findOrCreate('21', 'new.one');
        assertPlain(made);
        assert.deepEqual([created, made.username, made.strikes, made.joinedAt], [true, 'new.one', 0, NOW]);
        const again = await members.findOrCreate('21', 'renamed');
        assert.deepEqual([again.created, again.member.username], [false, 'new.one']);
        assert.equal(await members.findByDiscordId('99'), null);
        assert.equal(await members.findProfile('99'), null);
        assert.equal(await members.findAvailability('99'), null);
    });

    test('reads a profile with its tasks in order', async () => {
        const user = await member();
        const ids = [await task(user), await task(user)];
        const profile = await members.findProfile('11');
        assertPlain(profile);
        assert.deepEqual(
            profile.assignments.map(({ id }) => id),
            ids,
        );
        profile.assignments.forEach(assertPlain);
    });

    test('knows who is active', async () => {
        await member('11');
        await member('12', { isDeboarded: true });
        assert.deepEqual(
            [await members.isActive('11'), await members.isActive('12'), await members.isActive('13')],
            [true, false, false],
        );
    });

    test('deboards once and reactivates, renaming only when asked', async () => {
        await member();
        const gone = await members.deboard('11', 'Bye');
        assert.deepEqual([gone.isDeboarded, gone.deboardedAt, gone.deboardedMessage], [true, NOW, 'Bye']);
        assert.equal(await members.deboard('11', 'Again'), null);
        assert.equal(await members.deboard('99', 'x'), null);
        const back = await members.reactivate('11');
        assert.deepEqual([back.isDeboarded, back.deboardedAt, back.username], [false, null, 'member.11']);
        assert.equal((await members.reactivate('11', 'renamed')).username, 'renamed');
        assert.equal(await members.reactivate('99', 'x'), null);
    });

    test('strikes stay between zero and three, and report a missing member', async () => {
        await member();
        const counts = [];
        for (let index = 0; index < 4; index += 1) counts.push(await members.addStrike('11'));
        for (let index = 0; index < 4; index += 1) counts.push(await members.removeStrike('11'));
        assert.deepEqual(counts, [1, 2, 3, 3, 2, 1, 0, 0]);
        assert.deepEqual([await members.addStrike('99'), await members.removeStrike('99')], [null, null]);
    });

    test('lists members with strikes, most first', async () => {
        await member('11', { strikes: 1 });
        await member('12');
        await member('13', { strikes: 3 });
        assert.deepEqual(
            (await members.listWithStrikes()).map(({ discordId }) => discordId),
            ['13', '11'],
        );
    });

    test('lists free members and reports availability', async () => {
        const busy = await member('11');
        await task(busy, { status: 'LATE' });
        const done = await task(busy, { status: 'COMPLETED', completedAt: at(-DAY) });
        const free = await member('12', { isOnHiatus: true });
        const last = await task(free, { status: 'COMPLETED', deadline: at(-DAY) });
        const listed = await members.listFree();
        assert.deepEqual(
            listed.map(({ discordId, isOnHiatus, lastTask }) => [discordId, isOnHiatus, lastTask.id]),
            [['12', true, last]],
        );
        const availability = await members.findAvailability('11');
        assert.deepEqual(
            [availability.isFree, availability.activeTask.status, availability.lastTask.id],
            [false, 'LATE', done],
        );
        assert.equal((await members.findAvailability('12')).isFree, true);
    });
});

describe('hiatus', () => {
    test('pauses pending tasks only', async () => {
        const user = await member();
        const pending = await task(user);
        const late = await task(user, { status: 'LATE' });
        assert.equal(await members.startHiatus('11'), 1);
        assert.equal((await storedMember()).isOnHiatus, true);
        const paused = await stored(pending);
        assert.deepEqual(
            [paused.deadline, paused.firstReminderSent, paused.finalReminderSent],
            [new Date('2099-12-31'), true, true],
        );
        assert.deepEqual((await stored(late)).deadline, at(5 * DAY));
        assert.equal(await members.startHiatus('99'), 0);
    });

    test('changes nothing when the tasks cannot be paused', async (t) => {
        await task(await member());
        const original = await dump();
        failing(t, Assignment, 'updateMany');
        await assert.rejects(members.startHiatus('11'), /write failed/);
        assert.equal(await dump(), original);
    });

    test('restores tasks with a fresh deadline and leaves the rest paused', async () => {
        const user = await member('11', { isOnHiatus: true });
        const paused = { hasExtended: true, extensionCount: 1, firstReminderSent: true, finalReminderSent: true };
        const skit = await task(user, paused);
        const custom = await task(user, { taskType: 'custom', ...paused });
        const ended = await members.endHiatus('11', ({ taskType }) => (taskType === 'skit' ? at(DAY) : null));
        assert.deepEqual([ended.restored.map(({ id }) => id), ended.skipped.map(({ id }) => id)], [[skit], [custom]]);
        const restored = await stored(skit);
        assert.deepEqual(
            [restored.deadline, restored.hasExtended, restored.extensionCount, restored.firstReminderSent],
            [at(DAY), false, 1, false],
        );
        assert.equal((await stored(custom)).firstReminderSent, true);
        assert.equal((await storedMember()).isOnHiatus, false);
        assert.equal(await members.endHiatus('11', () => null), null);
        assert.equal(await members.endHiatus('99', () => null), null);
    });

    test('changes nothing when a later task cannot be restored', async (t) => {
        const user = await member('11', { isOnHiatus: true });
        await task(user);
        await task(user);
        const original = await dump();
        const updateOne = Assignment.updateOne;
        let calls = 0;
        t.mock.method(Assignment, 'updateOne', function (...args) {
            calls += 1;
            if (calls === 2) throw new Error('write failed');
            return updateOne.apply(this, args);
        });
        await assert.rejects(
            members.endHiatus('11', () => at(DAY)),
            /write failed/,
        );
        assert.equal(await dump(), original);
    });
});

describe('a transaction that cannot commit leaves no trace of', () => {
    for (const [name, run] of [
        ['creating a task', async (user) => aborted.tasks.create(newTask(user))],
        ['approving a task', async (_user, id) => aborted.tasks.completeAndForgive(id)],
        ['marking a task late', async (_user, id) => aborted.tasks.markLateAndStrike(id)],
        ['removing a task', async (_user, id) => aborted.tasks.remove(id)],
        ['starting a hiatus', async () => aborted.members.startHiatus('11')],
        ['ending a hiatus', async () => aborted.members.endHiatus('11', () => at(DAY))],
    ]) {
        test(name, async () => {
            const user = await member('11', { strikes: 1, isOnHiatus: name === 'ending a hiatus' });
            const id = await task(user, { deadline: at(-HOUR) });
            const original = await dump();
            await assert.rejects(run(user, id), /commit refused/);
            assert.equal(await dump(), original);
        });
    }
});

describe('races', () => {
    const repeat = async (run) => {
        for (let round = 0; round < ROUNDS; round += 1) {
            await database.reset();
            await run();
        }
    };
    const count = (results, predicate) => results.filter(predicate).length;

    test('approval and the scheduler never leave an approved task late or a strike behind', () =>
        repeat(async () => {
            const id = await task(await member(), { deadline: at(-HOUR) });
            const [approved] = await Promise.all([tasks.completeAndForgive(id), tasks.markLateAndStrike(id)]);
            assert.ok(approved);
            assert.equal((await stored(id)).status, 'COMPLETED');
            assert.equal((await storedMember()).strikes, 0);
        }));

    test('one task is approved once and forgives one strike', () =>
        repeat(async () => {
            const id = await task(await member('11', { strikes: 3 }));
            const results = await Promise.all(Array.from({ length: 4 }, () => tasks.completeAndForgive(id)));
            assert.equal(count(results, Boolean), 1);
            assert.equal((await storedMember()).strikes, 2);
        }));

    test('two schedulers strike once for one task', () =>
        repeat(async () => {
            const id = await task(await member(), { deadline: at(-HOUR) });
            const results = await Promise.all([tasks.markLateAndStrike(id), tasks.markLateAndStrike(id)]);
            assert.equal(
                count(results, ({ outcome }) => outcome === 'late'),
                1,
            );
            assert.equal((await storedMember()).strikes, 1);
        }));

    test('every extension that reports success is stored exactly once', () =>
        repeat(async () => {
            const id = await task(await member());
            const results = await Promise.allSettled(Array.from({ length: 4 }, () => tasks.extend(id, DAY)));
            const granted = count(results, ({ status }) => status === 'fulfilled');
            const { extensionCount, deadline } = await stored(id);
            assert.ok(granted >= 1 && granted <= 2);
            assert.deepEqual([extensionCount, deadline], [granted, at(5 * DAY + granted * DAY)]);
            for (const { reason } of results.filter(({ status }) => status === 'rejected')) {
                assert.match(reason.message, /^(TASK_CHANGED|ALREADY_EXTENDED)$/);
            }
        }));

    test('a task is either approved or removed, never both', () =>
        repeat(async () => {
            const id = await task(await member());
            const [approved, removed] = await Promise.all([tasks.completeAndForgive(id), tasks.remove(id)]);
            assert.equal(Boolean(approved), removed === 'completed');
            assert.equal(Boolean(await stored(id)), Boolean(approved));
            assert.equal((await storedMember()).assignments.length, approved ? 1 : 0);
        }));

    test('a member created by many callers at once exists once', () =>
        repeat(async () => {
            const results = await Promise.all(Array.from({ length: 6 }, () => members.findOrCreate('31', 'one')));
            assert.equal(
                count(results, ({ created }) => created),
                1,
            );
            assert.equal(await User.countDocuments({ discordId: '31' }), 1);
        }));

    test('tasks assigned at once are all attached', () =>
        repeat(async () => {
            const user = await member();
            const created = await Promise.all(Array.from({ length: 5 }, () => tasks.create(newTask(user))));
            assert.deepEqual((await storedMember()).assignments.map(String).sort(), created.map(({ id }) => id).sort());
        }));

    test('one hiatus ends once, and one member is deboarded once', () =>
        repeat(async () => {
            await task(await member('11', { isOnHiatus: true }));
            const ended = await Promise.all([1, 2].map(() => members.endHiatus('11', () => at(DAY))));
            assert.equal(count(ended, Boolean), 1);
            const deboarded = await Promise.all([1, 2].map(() => members.deboard('11', 'Bye')));
            assert.equal(count(deboarded, Boolean), 1);
        }));

    test('strikes added at once stop at three', () =>
        repeat(async () => {
            await member();
            await Promise.all(Array.from({ length: 6 }, () => members.addStrike('11')));
            assert.equal((await storedMember()).strikes, 3);
        }));

    test('a task removed during an extension is reported missing', async (t) => {
        const id = await task(await member());
        const exists = Assignment.exists;
        t.mock.method(Assignment, 'findOneAndUpdate', () => ({ lean: async () => null }));
        await assert.rejects(tasks.extend(id, DAY), { message: 'TASK_CHANGED' });
        t.mock.method(Assignment, 'exists', async (filter) => {
            await Assignment.deleteOne(filter);
            return exists.call(Assignment, filter);
        });
        await assert.rejects(tasks.extend(id, DAY), { message: 'TASK_NOT_FOUND' });
    });
});

describe('transaction runner', () => {
    test('returns the result, and ends the session after success and failure', async (t) => {
        const { createTransactionRunner } = await import('../../Utils/DBUtils/transaction.ts');
        const ended = [];
        const startSession = mongoose.connection.startSession.bind(mongoose.connection);
        t.mock.method(mongoose.connection, 'startSession', async () => {
            const session = await startSession();
            const endSession = session.endSession.bind(session);
            session.endSession = async () => {
                ended.push(true);
                return endSession();
            };
            return session;
        });
        const run = createTransactionRunner(mongoose.connection);
        assert.equal(await run(async () => 'done'), 'done');
        await assert.rejects(
            run(async () => {
                throw new Error('stop');
            }),
            /stop/,
        );
        assert.equal(ended.length, 2);
    });
});
