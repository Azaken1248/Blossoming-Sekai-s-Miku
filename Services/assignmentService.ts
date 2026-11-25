import type {
    Clock,
    HistoryFilters,
    MemberRepository,
    TaskRepository,
    TaskWithMember,
} from '../Utils/DBUtils/types.ts';
import { type AssignmentRequest, isCompleted, planAssignment, taskTitle } from '../Utils/domain/assignments.ts';
import { DomainError } from '../Utils/domain/errors.ts';
import type { RoleRules, Task } from '../Utils/domain/model.ts';

interface Dependencies {
    readonly tasks: Pick<TaskRepository, 'create' | 'findByIdentifier' | 'remove' | 'listHistory'>;
    readonly members: Pick<MemberRepository, 'findOrCreate'>;
    readonly rules: RoleRules;
    readonly clock: Clock;
}

export interface AssignRequest extends AssignmentRequest {
    readonly target: { readonly discordId: string; readonly username: string };
    readonly taskName?: string;
    readonly description?: string;
}

export interface HistoryPage {
    readonly tasks: readonly TaskWithMember[];
    readonly page: number;
    readonly totalPages: number;
    readonly total: number;
}

const HISTORY_PAGE_SIZE = 5;

export const createAssignmentService = ({ tasks, members, rules, clock }: Dependencies) => ({
    assign: async ({ target, taskName = '', description = '', ...request }: AssignRequest): Promise<Task> => {
        const plan = planAssignment(request, rules, clock.now());
        const { member } = await members.findOrCreate(target.discordId, target.username);
        return tasks.create({
            memberId: member.id,
            discordUserId: member.discordId,
            taskType: request.taskType,
            taskName,
            description,
            ...plan,
        });
    },

    remove: async (discordId: string, identifier: string): Promise<{ title: string }> => {
        const task = await tasks.findByIdentifier(discordId, identifier);
        if (!task) throw new DomainError('TASK_NOT_FOUND');
        const title = taskTitle(task);
        const outcome = isCompleted(task) ? 'completed' : await tasks.remove(task.id);
        if (outcome === 'completed') throw new DomainError('TASK_IS_PERMANENT', { title });
        if (outcome === 'missing') throw new DomainError('TASK_NOT_FOUND');
        return { title };
    },

    historyPage: async (filters: HistoryFilters, requestedPage: number): Promise<HistoryPage> => {
        const found = await tasks.listHistory(filters);
        const totalPages = Math.ceil(found.length / HISTORY_PAGE_SIZE);
        const page = Math.max(0, Math.min(requestedPage, totalPages - 1));
        const start = page * HISTORY_PAGE_SIZE;
        return { tasks: found.slice(start, start + HISTORY_PAGE_SIZE), page, totalPages, total: found.length };
    },
});

export type AssignmentService = ReturnType<typeof createAssignmentService>;
