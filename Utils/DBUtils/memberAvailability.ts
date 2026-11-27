import { isCompleted, isOpen } from '../domain/assignments.ts';
import { TASK_STATUS } from '../domain/model.ts';
import type { MemberAndTasks, RepositoryDependencies } from './dependencies.ts';
import { toTask } from './mappers.ts';
import type { MemberRepository } from './types.ts';

type MemberAvailability = Pick<MemberRepository, 'listFree' | 'findAvailability'>;

export const createMemberAvailability = ({ tasks, members }: RepositoryDependencies): MemberAvailability => ({
    listFree: async () => {
        const busyIds = await tasks.distinct('userId', { status: { $in: [TASK_STATUS.Pending, TASK_STATUS.Late] } });
        const stored = await members
            .find({ _id: { $nin: busyIds } })
            .populate({
                path: 'assignments',
                match: { status: TASK_STATUS.Completed },
                options: { sort: { deadline: -1 }, limit: 1 },
            })
            .lean<MemberAndTasks[]>();
        return stored.map(({ discordId, username, isOnHiatus, assignments }) => {
            const lastTask = assignments?.[0];
            return {
                discordId,
                username: username ?? null,
                isOnHiatus: isOnHiatus ?? false,
                lastTask: lastTask ? toTask(lastTask) : null,
            };
        });
    },

    findAvailability: async (discordId) => {
        const stored = await members
            .findOne({ discordId })
            .populate({ path: 'assignments', options: { sort: { completedAt: -1, deadline: -1 } } })
            .lean<MemberAndTasks>();
        if (!stored) return null;
        const assignments = (stored.assignments ?? []).map(toTask);
        const activeTask = assignments.find(isOpen) ?? null;
        return {
            discordId: stored.discordId,
            username: stored.username ?? null,
            isOnHiatus: stored.isOnHiatus ?? false,
            isFree: activeTask === null,
            activeTask,
            lastTask: assignments.find(isCompleted) ?? null,
        };
    },
});
