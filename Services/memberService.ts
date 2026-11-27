import type { MemberRepository } from '../Utils/DBUtils/types.ts';
import { createMemberReadService } from './memberReadService.ts';
import { createMembershipService } from './membershipService.ts';

export type { OnboardResult } from './membershipService.ts';
export type { FreeMembers, ProfileSummary } from './memberReadService.ts';

type Members = Pick<
    MemberRepository,
    | 'isActive'
    | 'findOrCreate'
    | 'reactivate'
    | 'findByDiscordId'
    | 'deboard'
    | 'findProfile'
    | 'findAvailability'
    | 'listFree'
>;

export const createMemberService = (dependencies: { readonly members: Members; readonly defaultFarewell: string }) => ({
    ...createMembershipService(dependencies),
    ...createMemberReadService(dependencies),
});

export type MemberService = ReturnType<typeof createMemberService>;
