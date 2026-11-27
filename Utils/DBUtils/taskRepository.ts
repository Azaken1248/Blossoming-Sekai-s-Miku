import type { RepositoryDependencies } from './dependencies.ts';
import { createTaskExtension } from './taskExtension.ts';
import { createTaskQueries } from './taskQueries.ts';
import { createTaskResolution } from './taskResolution.ts';
import { createTaskWrites } from './taskWrites.ts';
import type { TaskRepository } from './types.ts';

export type { RepositoryDependencies } from './dependencies.ts';

export const createTaskRepository = (dependencies: RepositoryDependencies): TaskRepository => ({
    ...createTaskQueries(dependencies),
    ...createTaskWrites(dependencies),
    ...createTaskResolution(dependencies),
    ...createTaskExtension(dependencies),
});
