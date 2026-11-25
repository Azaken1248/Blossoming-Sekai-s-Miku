import type { MemberRepository, TaskRepository } from '../Utils/DBUtils/types.ts';
import { isPending } from '../Utils/domain/assignments.ts';
import { DomainError } from '../Utils/domain/errors.ts';
import { canExtend, resolveExtensionMs } from '../Utils/domain/extensions.ts';
import { type NonEmpty, isNonEmpty } from '../Utils/domain/lists.ts';
import type { RoleRules, Task } from '../Utils/domain/model.ts';

interface Dependencies {
    readonly tasks: Pick<TaskRepository, 'setSubmissionChannel'>;
    readonly members: Pick<MemberRepository, 'findProfile'>;
    readonly rules: RoleRules;
}

export interface ExtensionRequest {
    readonly discordId: string;
    readonly reason: string;
    readonly taskName?: string | null;
    readonly channelId?: string | null;
}

export interface ExtensionOutcome {
    readonly task: Task;
    readonly extensionMs: number | undefined;
}

const isCalled = (wanted: string) => (task: Task) =>
    (task.taskName !== '' && task.taskName.toLowerCase() === wanted.toLowerCase()) || task.taskType === wanted;

const choose = (pending: NonEmpty<Task>, taskName: string | null | undefined): Task => {
    if (taskName) {
        const task = pending.find(isCalled(taskName));
        if (!task) throw new DomainError('TASK_NAME_UNKNOWN', { taskName });
        return task;
    }
    if (pending.length > 1) throw new DomainError('TASK_AMBIGUOUS', { tasks: pending });
    return pending[0];
};

export const createExtensionService = ({ tasks, members, rules }: Dependencies) => ({
    request: async ({ discordId, reason, taskName, channelId }: ExtensionRequest): Promise<ExtensionOutcome> => {
        const profile = await members.findProfile(discordId);
        const pending = profile?.assignments.filter(isPending) ?? [];
        if (!isNonEmpty(pending)) throw new DomainError('NO_PENDING_TASKS');
        if (reason.trim() === '') throw new DomainError('REASON_REQUIRED');
        const task = choose(pending, taskName);
        if (!canExtend(task)) throw new DomainError('ALREADY_EXTENDED');
        const extensionMs = resolveExtensionMs(task, { RULES: rules });
        if (channelId) await tasks.setSubmissionChannel(task.id, channelId);
        return { task, extensionMs };
    },
});

export type ExtensionService = ReturnType<typeof createExtensionService>;
