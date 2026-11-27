import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
    NOW,
    HOUR,
    DAY,
    MISSING,
    at,
    User,
    Assignment,
    tasks,
    members,
    member,
    task,
    stored,
    storedMember,
    dump,
    failing,
    assertPlain,
    newTask,
    useRepositories,
} from './repositorySupport.js';

useRepositories();

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
