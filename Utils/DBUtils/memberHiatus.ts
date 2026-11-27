import type { StoredTask } from '../../DB/Schemas/assignment.ts';
import { TASK_STATUS, type Task } from '../domain/model.ts';
import type { RepositoryDependencies } from './dependencies.ts';
import { toTask } from './mappers.ts';
import type { MemberRepository } from './types.ts';

const PAUSED_DEADLINE = new Date('2099-12-31');

export const createMemberHiatus = ({
    tasks,
    members,
    transaction,
}: RepositoryDependencies): Pick<MemberRepository, 'startHiatus' | 'endHiatus'> => ({
    startHiatus: (discordId) =>
        transaction(async (session) => {
            await members.updateOne({ discordId }, { isOnHiatus: true }, { session });
            const { matchedCount } = await tasks.updateMany(
                { discordUserId: discordId, status: TASK_STATUS.Pending },
                { deadline: PAUSED_DEADLINE, firstReminderSent: true, finalReminderSent: true },
                { session },
            );
            return matchedCount;
        }),

    endHiatus: (discordId, freshDeadline) =>
        transaction(async (session) => {
            const { matchedCount } = await members.updateOne(
                { discordId, isOnHiatus: true },
                { isOnHiatus: false },
                { session },
            );
            if (matchedCount === 0) return null;
            const paused = await tasks
                .find({ discordUserId: discordId, status: TASK_STATUS.Pending })
                .session(session)
                .lean<StoredTask[]>();
            const restored: Task[] = [];
            const skipped: Task[] = [];
            for (const stored of paused) {
                const task = toTask(stored);
                const deadline = freshDeadline(task);
                if (!deadline) {
                    skipped.push(task);
                    continue;
                }
                const changes = { deadline, hasExtended: false, firstReminderSent: false, finalReminderSent: false };
                await tasks.updateOne({ _id: stored._id }, changes, { session });
                restored.push({ ...task, ...changes });
            }
            return { restored, skipped };
        }),
});
