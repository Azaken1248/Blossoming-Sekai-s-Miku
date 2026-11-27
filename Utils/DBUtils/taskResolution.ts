import type { StoredTask } from '../../DB/Schemas/assignment.ts';
import { TASK_STATUS } from '../domain/model.ts';
import { OPEN_STATUSES, type RepositoryDependencies } from './dependencies.ts';
import { toTask } from './mappers.ts';
import { decrementStrikes, incrementStrikes } from './strikeUpdates.ts';
import type { TaskRepository } from './types.ts';

type TaskResolution = Pick<TaskRepository, 'complete' | 'completeAndForgive' | 'markLateAndStrike'>;

export const createTaskResolution = ({
    tasks,
    members,
    transaction,
    clock,
}: RepositoryDependencies): TaskResolution => ({
    complete: async (id) => {
        const stored = await tasks
            .findOneAndUpdate(
                { _id: id, status: { $in: OPEN_STATUSES } },
                { status: TASK_STATUS.Completed, completedAt: clock.now() },
                { returnDocument: 'after' },
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
                    { returnDocument: 'after', session },
                )
                .lean<StoredTask>();
            if (!stored) return null;
            const strikes = await decrementStrikes(members, { _id: stored.userId }, session);
            return { task: toTask(stored), strikes };
        }),

    markLateAndStrike: (id) =>
        transaction(async (session) => {
            const stored = await tasks
                .findOneAndUpdate(
                    { _id: id, status: TASK_STATUS.Pending, deadline: { $lt: clock.now() } },
                    { status: TASK_STATUS.Late },
                    { returnDocument: 'after', session },
                )
                .lean<StoredTask>();
            if (!stored) return { outcome: 'skipped' };
            const strikes = await incrementStrikes(members, { _id: stored.userId }, session);
            return { outcome: 'late', strikes };
        }),
});
