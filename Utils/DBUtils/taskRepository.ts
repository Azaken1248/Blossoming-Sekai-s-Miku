import type { Model } from 'mongoose';
import type { StoredTask } from '../../DB/Schemas/assignment.ts';
import type { StoredMember } from '../../DB/Schemas/user.ts';
import { MAX_EXTENSIONS_PER_TASK, countExtensionsUsed } from '../domain/extensions.ts';
import { DomainError } from '../domain/errors.ts';
import { type ReminderType, TASK_STATUS } from '../domain/model.ts';
import { dueReminder } from '../domain/reminders.ts';
import { type Populated, toTask, toTaskWithMember } from './mappers.ts';
import { containsText } from './searchPattern.ts';
import { decrementStrikes, incrementStrikes } from './strikeUpdates.ts';
import type { RunTransaction } from './transaction.ts';
import type { Clock, TaskRepository } from './types.ts';

export interface RepositoryDependencies {
    readonly tasks: Model<StoredTask>;
    readonly members: Model<StoredMember>;
    readonly transaction: RunTransaction;
    readonly clock: Clock;
}

type TaskAndStoredMember = Populated<StoredTask, 'userId', StoredMember | null>;

const DEFAULT_HISTORY_LIMIT = 50;
const OPEN_STATUSES = [TASK_STATUS.Pending, TASK_STATUS.Late];

const REMINDER_FIELDS: Record<ReminderType, Partial<StoredTask>> = {
    first: { firstReminderSent: true },
    final: { finalReminderSent: true },
};

export const createTaskRepository = ({
    tasks,
    members,
    transaction,
    clock,
}: RepositoryDependencies): TaskRepository => ({
    create: (task) =>
        transaction(async (session) => {
            const document = new tasks({
                userId: task.memberId,
                discordUserId: task.discordUserId,
                roleCategoryId: task.roleCategoryId,
                roleName: task.roleName,
                taskType: task.taskType,
                taskName: task.taskName ?? '',
                description: task.description ?? '',
                assignedAt: clock.now(),
                deadline: task.deadline,
                customExtension: task.customExtension ?? null,
            });
            await document.save({ session });
            const { matchedCount } = await members.updateOne(
                { _id: task.memberId },
                { $push: { assignments: document._id } },
                { session },
            );
            if (matchedCount === 0) throw new DomainError('MEMBER_NOT_FOUND');
            return toTask(document.toObject());
        }),

    findById: async (id) => {
        const stored = await tasks.findById(id).populate('userId').lean<TaskAndStoredMember>();
        return stored ? toTaskWithMember(stored) : null;
    },

    findByIdentifier: async (discordUserId, identifier) => {
        const stored = await tasks
            .findOne({ discordUserId, $or: [{ taskName: identifier }, { taskType: identifier }] })
            .lean<StoredTask>();
        return stored ? toTask(stored) : null;
    },

    listPending: async () => {
        const stored = await tasks.find({ status: TASK_STATUS.Pending }).lean<StoredTask[]>();
        return stored.map(toTask);
    },

    listOverdue: async () => {
        const stored = await tasks
            .find({ status: TASK_STATUS.Pending, deadline: { $lt: clock.now() } })
            .populate('userId')
            .lean<TaskAndStoredMember[]>();
        return stored.map(toTaskWithMember);
    },

    listDueReminders: async (thresholds) => {
        const now = clock.now();
        const stored = await tasks.find({ status: TASK_STATUS.Pending, deadline: { $gt: now } }).lean<StoredTask[]>();
        return stored.map((task) => dueReminder(toTask(task), thresholds, now)).filter((reminder) => reminder !== null);
    },

    listHistory: async (filters = {}) => {
        const query: Record<string, unknown> = {};
        if (filters.discordUserId) query['discordUserId'] = filters.discordUserId;
        if (filters.taskName) {
            const pattern = containsText(filters.taskName);
            query['$or'] = [{ taskName: pattern }, { taskType: pattern }];
        }
        if (filters.status) query['status'] = filters.status.toUpperCase();
        if (filters.roleName) query['roleName'] = containsText(filters.roleName);
        const stored = await tasks
            .find(query)
            .sort({ assignedAt: -1 })
            .populate('userId')
            .limit(filters.limit ?? DEFAULT_HISTORY_LIMIT)
            .lean<TaskAndStoredMember[]>();
        return stored.map(toTaskWithMember);
    },

    markReminderSent: async (id, reminderType) => {
        await tasks.updateOne({ _id: id }, REMINDER_FIELDS[reminderType]);
    },

    setSubmissionChannel: async (id, channelId) => {
        await tasks.updateOne({ _id: id }, { submissionChannelId: channelId });
    },

    complete: async (id) => {
        const stored = await tasks
            .findOneAndUpdate(
                { _id: id, status: { $in: OPEN_STATUSES } },
                { status: TASK_STATUS.Completed, completedAt: clock.now() },
                { new: true },
            )
            .lean<StoredTask>();
        return stored ? toTask(stored) : null;
    },

    completeAndForgive: (id) =>
        transaction(async (session) => {
            const stored = await tasks
                .findOneAndUpdate(
                    { _id: id, status: { $in: OPEN_STATUSES } },
                    { status: TASK_STATUS.Completed, completedAt: clock.now() },
                    { new: true, session },
                )
                .lean<StoredTask>();
            if (!stored) return null;
            const strikes = await decrementStrikes(members, { _id: stored.userId }, session);
            return { task: toTask(stored), strikes };
        }),

    extend: async (id, extensionMs) => {
        if (!Number.isFinite(extensionMs) || extensionMs <= 0) throw new Error('INVALID_EXTENSION');
        const current = await tasks.findById(id).lean<StoredTask>();
        if (!current) throw new DomainError('TASK_NOT_FOUND');
        const used = countExtensionsUsed(current);
        if (used >= MAX_EXTENSIONS_PER_TASK) throw new DomainError('ALREADY_EXTENDED');
        const updated = await tasks
            .findOneAndUpdate(
                { _id: id, deadline: current.deadline, extensionCount: current.extensionCount ?? null },
                {
                    deadline: new Date(current.deadline.getTime() + extensionMs),
                    hasExtended: true,
                    extensionCount: used + 1,
                },
                { new: true },
            )
            .lean<StoredTask>();
        if (updated) return toTask(updated);
        throw new DomainError((await tasks.exists({ _id: id })) ? 'TASK_CHANGED' : 'TASK_NOT_FOUND');
    },

    markLateAndStrike: (id) =>
        transaction(async (session) => {
            const stored = await tasks
                .findOneAndUpdate(
                    { _id: id, status: TASK_STATUS.Pending, deadline: { $lt: clock.now() } },
                    { status: TASK_STATUS.Late },
                    { new: true, session },
                )
                .lean<StoredTask>();
            if (!stored) return { outcome: 'skipped' };
            const strikes = await incrementStrikes(members, { _id: stored.userId }, session);
            return { outcome: 'late', strikes };
        }),

    remove: (id) =>
        transaction(async (session) => {
            const removed = await tasks
                .findOneAndDelete({ _id: id, status: { $ne: TASK_STATUS.Completed } }, { session })
                .lean<StoredTask>();
            if (!removed) return (await tasks.exists({ _id: id }).session(session)) ? 'completed' : 'missing';
            await members.updateOne(
                { discordId: removed.discordUserId },
                { $pull: { assignments: removed._id } },
                { session },
            );
            return 'removed';
        }),
});
