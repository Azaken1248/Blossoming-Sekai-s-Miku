import mongoose from 'mongoose';
import Assignment from '../../DB/Schemas/assignment.ts';
import User, { DEFAULT_DEBOARDED_MESSAGE } from '../../DB/Schemas/user.ts';
import { createMemberRepository } from './memberRepository.ts';
import { createTaskRepository } from './taskRepository.ts';
import { createTransactionRunner } from './transaction.ts';

const dependencies = {
    tasks: Assignment,
    members: User,
    transaction: createTransactionRunner(mongoose.connection),
    clock: { now: () => new Date() },
};

export const tasks = createTaskRepository(dependencies);
export const members = createMemberRepository(dependencies);
export { DEFAULT_DEBOARDED_MESSAGE };
