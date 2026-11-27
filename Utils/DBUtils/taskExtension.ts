import type { StoredTask } from '../../DB/Schemas/assignment.ts';
import { DomainError } from '../domain/errors.ts';
import { MAX_EXTENSIONS_PER_TASK, countExtensionsUsed } from '../domain/extensions.ts';
import type { RepositoryDependencies } from './dependencies.ts';
import { toTask } from './mappers.ts';
import type { TaskRepository } from './types.ts';

export const createTaskExtension = ({ tasks }: RepositoryDependencies): Pick<TaskRepository, 'extend'> => ({
    extend: async (id, extensionMs) => {
        if (!Number.isFinite(extensionMs) || extensionMs <= 0) throw new Error('INVALID_EXTENSION');
        const current = await tasks.findById(id).lean<StoredTask>();
        if (!current) throw new DomainError('TASK_NOT_FOUND');
        const used = countExtensionsUsed(current);
        if (used >= MAX_EXTENSIONS_PER_TASK) throw new DomainError('ALREADY_EXTENDED');
        const updated = await tasks
            .findOneAndUpdate(
                { _id: id, deadline: current.deadline, extensionCount: current.extensionCount ?? null },
                {
                    deadline: new Date(current.deadline.getTime() + extensionMs),
                    hasExtended: true,
                    extensionCount: used + 1,
                },
                { new: true },
            )
            .lean<StoredTask>();
        if (updated) return toTask(updated);
        throw new DomainError((await tasks.exists({ _id: id })) ? 'TASK_CHANGED' : 'TASK_NOT_FOUND');
    },
});
