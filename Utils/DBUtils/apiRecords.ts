import Assignment from '../../DB/Schemas/assignment.ts';
import User from '../../DB/Schemas/user.ts';
import { members, tasks } from './index.ts';
import { containsText } from './searchPattern.ts';
import { TASK_STATUS } from '../domain/model.ts';
import type { NewTask } from './types.ts';

const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 500;

interface ListOptions {
    readonly limit?: unknown;
    readonly search?: string | null;
}

const taskRecord = (id: string) => Assignment.findById(id);

export const createAssignment = async (task: NewTask) => taskRecord((await tasks.create(task)).id);

export const completeAssignment = async (id: string) => {
    const completed = await tasks.complete(id);
    return completed ? taskRecord(completed.id) : null;
};

export const extendAssignment = async (id: string, extensionMs: number) =>
    taskRecord((await tasks.extend(id, extensionMs)).id);

export const fetchPendingTask = async (discordUserId: string) => {
    const member = await User.findOne({ discordId: discordUserId });
    if (!member) return null;
    return Assignment.findOne({ userId: member._id, status: TASK_STATUS.Pending }).sort({ deadline: 1 });
};

export const fetchOverdueTasks = () =>
    Assignment.find({ status: TASK_STATUS.Pending, deadline: { $lt: new Date() } }).populate('userId');

export const findOrCreateUser = async (discordId: string, username: string) => {
    await members.findOrCreate(discordId, username);
    return User.findOne({ discordId });
};

export const getUserProfile = (discordId: string) => User.findOne({ discordId }).populate('assignments').lean();

export const listUsers = ({ limit = DEFAULT_LIST_LIMIT, search = '' }: ListOptions = {}) => {
    const text = (search ?? '').trim();
    const pattern = text ? containsText(text) : null;
    const query = pattern ? { $or: [{ username: pattern }, { discordId: pattern }] } : {};
    return User.find(query)
        .sort('-joinedAt')
        .limit(Math.max(1, Math.min(Number(limit) || DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT)))
        .select('discordId username strikes isOnHiatus roles joinedAt')
        .lean();
};
