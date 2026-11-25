import type { MemberRepository, TaskRepository } from '../Utils/DBUtils/types.ts';
import { isOpen } from '../Utils/domain/assignments.ts';
import { DomainError } from '../Utils/domain/errors.ts';
import { type NonEmpty, isNonEmpty } from '../Utils/domain/lists.ts';
import type { Task } from '../Utils/domain/model.ts';

interface Dependencies {
    readonly tasks: Pick<TaskRepository, 'setSubmissionChannel'>;
    readonly members: Pick<MemberRepository, 'findProfile'>;
}

export interface SubmissionRequest {
    readonly discordId: string;
    readonly taskId?: string | null;
    readonly taskName?: string | null;
    readonly channelId?: string | null;
}

export type SubmissionOutcome =
    { readonly kind: 'request'; readonly task: Task } | { readonly kind: 'choose'; readonly tasks: readonly Task[] };

const sameText = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

const isCalled = (wanted: string) => (task: Task) =>
    (task.taskName !== '' && sameText(task.taskName, wanted)) || sameText(task.taskType, wanted);

export const createSubmissionService = ({ tasks, members }: Dependencies) => {
    const choose = (open: NonEmpty<Task>, { taskId, taskName }: SubmissionRequest): Task | null => {
        if (taskId) {
            const task = open.find(({ id }) => id === taskId);
            if (!task) throw new DomainError('TASK_GONE');
            return task;
        }
        if (taskName) {
            const task = open.find(isCalled(taskName));
            if (!task) throw new DomainError('TASK_NAME_UNKNOWN', { taskName });
            return task;
        }
        return open.length === 1 ? open[0] : null;
    };

    return {
        request: async (request: SubmissionRequest): Promise<SubmissionOutcome> => {
            const profile = await members.findProfile(request.discordId);
            const open = profile?.assignments.filter(isOpen) ?? [];
            if (!isNonEmpty(open)) throw new DomainError('NO_PENDING_TASKS');
            const task = choose(open, request);
            if (!task) return { kind: 'choose', tasks: open };
            if (request.channelId) await tasks.setSubmissionChannel(task.id, request.channelId);
            return { kind: 'request', task };
        },
    };
};

export type SubmissionService = ReturnType<typeof createSubmissionService>;
