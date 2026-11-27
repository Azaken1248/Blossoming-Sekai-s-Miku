import type { StoredTask } from '../../DB/Schemas/assignment.ts';
import { DomainError } from '../domain/errors.ts';
import { type ReminderType, TASK_STATUS } from '../domain/model.ts';
import type { RepositoryDependencies } from './dependencies.ts';
import { toTask } from './mappers.ts';
import type { TaskRepository } from './types.ts';

type TaskWrites = Pick<TaskRepository, 'create' | 'markReminderSent' | 'setSubmissionChannel' | 'remove'>;

const REMINDER_FIELDS: Record<ReminderType, Partial<StoredTask>> = {
    first: { firstReminderSent: true },
    final: { finalReminderSent: true },
};

export const createTaskWrites = ({ tasks, members, transaction, clock }: RepositoryDependencies): TaskWrites => ({
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

    markReminderSent: async (id, reminderType) => {
        await tasks.updateOne({ _id: id }, REMINDER_FIELDS[reminderType]);
    },

    setSubmissionChannel: async (id, channelId) => {
        await tasks.updateOne({ _id: id }, { submissionChannelId: channelId });
    },

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
