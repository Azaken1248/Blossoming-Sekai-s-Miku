import type { Model } from 'mongoose';
import type { StoredTask } from '../../DB/Schemas/assignment.ts';
import type { StoredMember } from '../../DB/Schemas/user.ts';
import type { Populated } from './mappers.ts';
import type { RunTransaction } from './transaction.ts';
import type { Clock } from './types.ts';
import { TASK_STATUS } from '../domain/model.ts';

export interface RepositoryDependencies {
    readonly tasks: Model<StoredTask>;
    readonly members: Model<StoredMember>;
    readonly transaction: RunTransaction;
    readonly clock: Clock;
}

export type TaskAndStoredMember = Populated<StoredTask, 'userId', StoredMember | null>;

export type MemberAndTasks = Populated<StoredMember, 'assignments', StoredTask[] | undefined>;

export const OPEN_STATUSES = [TASK_STATUS.Pending, TASK_STATUS.Late];
