import type { RepositoryDependencies } from './dependencies.ts';
import { createMemberAvailability } from './memberAvailability.ts';
import { createMemberHiatus } from './memberHiatus.ts';
import { createMemberLifecycle } from './memberLifecycle.ts';
import { createMemberQueries } from './memberQueries.ts';
import type { MemberRepository } from './types.ts';

export const createMemberRepository = (dependencies: RepositoryDependencies): MemberRepository => ({
    ...createMemberQueries(dependencies),
    ...createMemberLifecycle(dependencies),
    ...createMemberAvailability(dependencies),
    ...createMemberHiatus(dependencies),
});
