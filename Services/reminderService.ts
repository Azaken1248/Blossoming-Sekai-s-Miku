import type { MemberRepository, TaskRepository, TaskWithMember } from '../Utils/DBUtils/types.ts';
import type { ReminderThresholds, ReminderType, Task } from '../Utils/domain/model.ts';

interface Dependencies {
    readonly tasks: Pick<
        TaskRepository,
        'listPending' | 'listDueReminders' | 'markReminderSent' | 'listOverdue' | 'markLateAndStrike'
    >;
    readonly members: Pick<MemberRepository, 'findByDiscordId'>;
    readonly thresholds: ReminderThresholds;
}

export type OverdueSkip = 'hiatus' | 'orphaned' | 'changed' | 'noMemberRecord';

export interface ReminderHandlers {
    readonly send: (task: Task, reminderType: ReminderType) => Promise<void>;
    readonly skip: (task: Task) => void;
}

export interface OverdueHandlers {
    readonly struck: (task: TaskWithMember, strikes: number) => Promise<void>;
    readonly skip: (task: TaskWithMember, reason: OverdueSkip) => void;
}

export interface RunSummary {
    readonly done: number;
    readonly skipped: number;
}

export const createReminderService = ({ tasks, members, thresholds }: Dependencies) => {
    const onHiatus = async (discordId: string): Promise<boolean> =>
        (await members.findByDiscordId(discordId))?.isOnHiatus === true;

    const overdueSkip = async (task: TaskWithMember): Promise<OverdueSkip | number> => {
        if (await onHiatus(task.discordUserId)) return 'hiatus';
        if (!task.member) return 'orphaned';
        const result = await tasks.markLateAndStrike(task.id);
        if (result.outcome === 'skipped') return 'changed';
        return result.strikes ?? 'noMemberRecord';
    };

    return {
        pending: (): Promise<Task[]> => tasks.listPending(),

        sendReminders: async ({ send, skip }: ReminderHandlers): Promise<RunSummary> => {
            const summary = { done: 0, skipped: 0 };
            for (const { task, reminderType } of await tasks.listDueReminders(thresholds)) {
                if (await onHiatus(task.discordUserId)) {
                    skip(task);
                    summary.skipped++;
                    continue;
                }
                await send(task, reminderType);
                await tasks.markReminderSent(task.id, reminderType);
                summary.done++;
            }
            return summary;
        },

        strikeOverdue: async ({ struck, skip }: OverdueHandlers): Promise<RunSummary> => {
            const summary = { done: 0, skipped: 0 };
            for (const task of await tasks.listOverdue()) {
                const outcome = await overdueSkip(task);
                if (typeof outcome === 'string') {
                    skip(task, outcome);
                    summary.skipped++;
                    continue;
                }
                await struck(task, outcome);
                summary.done++;
            }
            return summary;
        },
    };
};

export type ReminderService = ReturnType<typeof createReminderService>;
