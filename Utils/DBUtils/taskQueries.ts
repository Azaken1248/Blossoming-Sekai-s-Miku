import type { StoredTask } from '../../DB/Schemas/assignment.ts';
import { TASK_STATUS } from '../domain/model.ts';
import { dueReminder } from '../domain/reminders.ts';
import type { RepositoryDependencies, TaskAndStoredMember } from './dependencies.ts';
import { toTask, toTaskWithMember } from './mappers.ts';
import { containsText } from './searchPattern.ts';
import type { HistoryFilters, TaskRepository } from './types.ts';

type TaskQueries = Pick<
    TaskRepository,
    'findById' | 'findByIdentifier' | 'listPending' | 'listOverdue' | 'listDueReminders' | 'listHistory'
>;

const DEFAULT_HISTORY_LIMIT = 50;

const historyQuery = (filters: HistoryFilters): Record<string, unknown> => {
    const query: Record<string, unknown> = {};
    if (filters.discordUserId) query['discordUserId'] = filters.discordUserId;
    if (filters.taskName) {
        const pattern = containsText(filters.taskName);
        query['$or'] = [{ taskName: pattern }, { taskType: pattern }];
    }
    if (filters.status) query['status'] = filters.status.toUpperCase();
    if (filters.roleName) query['roleName'] = containsText(filters.roleName);
    return query;
};

export const createTaskQueries = ({ tasks, clock }: RepositoryDependencies): TaskQueries => ({
    findById: async (id) => {
        const stored = await tasks.findById(id).populate('userId').lean<TaskAndStoredMember>();
        return stored ? toTaskWithMember(stored) : null;
    },

    findByIdentifier: async (discordUserId, identifier) => {
        const stored = await tasks
            .findOne({ discordUserId, $or: [{ taskName: identifier }, { taskType: identifier }] })
            .lean<StoredTask>();
        return stored ? toTask(stored) : null;
    },

    listPending: async () => {
        const stored = await tasks.find({ status: TASK_STATUS.Pending }).lean<StoredTask[]>();
        return stored.map(toTask);
    },

    listOverdue: async () => {
        const stored = await tasks
            .find({ status: TASK_STATUS.Pending, deadline: { $lt: clock.now() } })
            .populate('userId')
            .lean<TaskAndStoredMember[]>();
        return stored.map(toTaskWithMember);
    },

    listDueReminders: async (thresholds) => {
        const now = clock.now();
        const stored = await tasks.find({ status: TASK_STATUS.Pending, deadline: { $gt: now } }).lean<StoredTask[]>();
        return stored.map((task) => dueReminder(toTask(task), thresholds, now)).filter((reminder) => reminder !== null);
    },

    listHistory: async (filters = {}) => {
        const stored = await tasks
            .find(historyQuery(filters))
            .sort({ assignedAt: -1 })
            .populate('userId')
            .limit(filters.limit ?? DEFAULT_HISTORY_LIMIT)
            .lean<TaskAndStoredMember[]>();
        return stored.map(toTaskWithMember);
    },
});
