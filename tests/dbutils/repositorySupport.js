import { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startDatabase } from '../support/database.js';

export const NOW = new Date('2026-06-15T12:00:00.000Z');
export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
export const MISSING = '0123456789abcdef01234567';
export const ROUNDS = 12;
export const at = (offset) => new Date(NOW.getTime() + offset);

export let database;
export let User;
export let Assignment;
export let tasks;
export let members;
export let aborted;

export const useRepositories = () => {
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
};

export const member = (discordId = '11', extra = {}) =>
    User.create({ discordId, username: `member.${discordId}`, joinedAt: at(-30 * DAY), ...extra });

export const task = async (user, overrides = {}) => {
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

export const stored = (id) => Assignment.findById(id).lean();
export const storedMember = (discordId = '11') => User.findOne({ discordId }).lean();
export const dump = async () =>
    JSON.stringify([await User.find().sort('_id').lean(), await Assignment.find().sort('_id').lean()]);

export const failing = (t, model, method) =>
    t.mock.method(model, method, () => {
        throw new Error('write failed');
    });

export const assertPlain = (value) => {
    assert.equal(Object.getPrototypeOf(value), Object.prototype);
    assert.equal(typeof value.id, 'string');
    assert.equal('_id' in value, false);
};

export const newTask = (user, extra = {}) => ({
    memberId: user._id.toString(),
    discordUserId: user.discordId,
    roleCategoryId: '1',
    roleName: 'VA',
    taskType: 'skit',
    deadline: at(DAY),
    ...extra,
});
