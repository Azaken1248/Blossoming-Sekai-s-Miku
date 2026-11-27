import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    NOW,
    DAY,
    at,
    Assignment,
    members,
    member,
    task,
    stored,
    storedMember,
    dump,
    failing,
    assertPlain,
    useRepositories,
} from './repositorySupport.js';

useRepositories();

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
