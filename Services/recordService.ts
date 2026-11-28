import type { Clock, NewTask } from '../Utils/DBUtils/types.ts';
import { plannedDeadline } from '../Utils/domain/assignments.ts';
import { DomainError } from '../Utils/domain/errors.ts';
import type { RoleRule, RoleRules } from '../Utils/domain/model.ts';

export interface TaskOwner {
    readonly memberId: string;
    readonly discordId: string;
    readonly isDeboarded: boolean;
}

export interface StoredRecords {
    readonly findOrCreateUser: (discordId: string, username: string) => Promise<unknown>;
    readonly taskOwner: (discordId: string) => Promise<TaskOwner | null>;
    readonly createAssignment: (task: NewTask) => Promise<unknown>;
    readonly completeAssignment: (id: string) => Promise<unknown>;
    readonly extendAssignment: (id: string, extensionMs: number) => Promise<unknown>;
    readonly fetchPendingTask: (discordUserId: string) => Promise<unknown>;
    readonly fetchOverdueTasks: () => Promise<readonly unknown[]>;
}

export interface StoredAssignment {
    readonly discordId: string;
    readonly roleCategoryId: string;
    readonly roleName: string | undefined;
    readonly taskType: string;
    readonly taskName: string;
    readonly description: string;
    readonly duration: number | null;
}

interface Dependencies {
    readonly records: StoredRecords;
    readonly rules: RoleRules;
    readonly clock: Clock;
}

const assignWith =
    ({ records, rules, clock }: Dependencies) =>
    async ({ discordId, roleName, taskName, description, ...request }: StoredAssignment) => {
        const deadline = plannedDeadline(request, rules, clock.now());
        const owner = await records.taskOwner(discordId);
        if (!owner) throw new DomainError('MEMBER_NOT_FOUND');
        if (owner.isDeboarded) throw new DomainError('MEMBER_DEBOARDED');
        return records.createAssignment({
            memberId: owner.memberId,
            discordUserId: owner.discordId,
            roleCategoryId: request.roleCategoryId,
            roleName: roleName || (rules[request.roleCategoryId] as RoleRule).name,
            taskType: request.taskType,
            taskName,
            description,
            deadline,
        });
    };

export const createRecordService = (dependencies: Dependencies) => {
    const { records } = dependencies;
    return {
        register: async (discordId: string, username: string) => records.findOrCreateUser(discordId, username),
        assign: assignWith(dependencies),
        complete: async (id: string) => records.completeAssignment(id),
        extend: async (id: string, extensionMs: number) => records.extendAssignment(id, extensionMs),
        pending: async (discordUserId: string) => records.fetchPendingTask(discordUserId),
        overdue: async () => records.fetchOverdueTasks(),
    };
};
