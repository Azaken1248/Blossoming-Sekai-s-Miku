import type { NewTask } from '../Utils/DBUtils/types.ts';

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

export const createRecordService = ({ records }: { readonly records: StoredRecords }) => ({
    register: async (discordId: string, username: string) => records.findOrCreateUser(discordId, username),
    taskOwner: async (discordId: string) => records.taskOwner(discordId),
    createTask: async (task: NewTask) => records.createAssignment(task),
    complete: async (id: string) => records.completeAssignment(id),
    extend: async (id: string, extensionMs: number) => records.extendAssignment(id, extensionMs),
    pending: async (discordUserId: string) => records.fetchPendingTask(discordUserId),
    overdue: async () => records.fetchOverdueTasks(),
});
