import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
    HOUR,
    DAY,
    ROUNDS,
    at,
    database,
    User,
    Assignment,
    tasks,
    members,
    aborted,
    member,
    task,
    stored,
    storedMember,
    dump,
    newTask,
    useRepositories,
} from './repositorySupport.js';

useRepositories();

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
