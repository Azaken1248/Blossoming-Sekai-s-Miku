import type { TaskRepository, TaskWithMember } from '../Utils/DBUtils/types.ts';
import { DomainError } from '../Utils/domain/errors.ts';
import { resolveExtensionMs } from '../Utils/domain/extensions.ts';
import type { RoleRules, Task } from '../Utils/domain/model.ts';

interface Dependencies {
    readonly tasks: Pick<TaskRepository, 'findById' | 'completeAndForgive' | 'extend'>;
    readonly rules: RoleRules;
}

export interface ExtensionApproved {
    readonly extensionMs: number;
    readonly deadline: Date;
}

export const createApprovalService = ({ tasks, rules }: Dependencies) => ({
    find: (taskId: string): Promise<TaskWithMember | null> => tasks.findById(taskId),

    approveSubmission: async (task: Task): Promise<{ strikes: number | null }> => {
        const completed = await tasks.completeAndForgive(task.id);
        if (!completed) throw new DomainError('TASK_RESOLVED');
        return { strikes: completed.strikes };
    },

    approveExtension: async (task: Task): Promise<ExtensionApproved> => {
        const extensionMs = resolveExtensionMs(task, { RULES: rules }) ?? Number.NaN;
        const updated = await tasks.extend(task.id, extensionMs);
        return { extensionMs, deadline: updated.deadline };
    },
});

export type ApprovalService = ReturnType<typeof createApprovalService>;
