import type { Availability, FreeMember, MemberProfile, MemberRepository } from '../Utils/DBUtils/types.ts';
import { isCompleted, isLate, isOpen, isPending } from '../Utils/domain/assignments.ts';
import { DomainError } from '../Utils/domain/errors.ts';
import type { Member, Task } from '../Utils/domain/model.ts';

type Members = Pick<MemberRepository, 'findProfile' | 'findAvailability' | 'listFree'>;

export interface ProfileSummary {
    readonly member: Member;
    readonly total: number;
    readonly pending: readonly Task[];
    readonly completed: readonly Task[];
    readonly late: readonly Task[];
}

export interface FreeMembers {
    readonly active: readonly FreeMember[];
    readonly onHiatus: readonly FreeMember[];
}

export const createMemberReadService = ({ members }: { readonly members: Members }) => {
    const requireProfile = async (discordId: string): Promise<MemberProfile> => {
        const profile = await members.findProfile(discordId);
        if (!profile) throw new DomainError('MEMBER_NOT_FOUND');
        return profile;
    };

    return {
        profile: async (discordId: string): Promise<ProfileSummary> => {
            const { assignments, ...member } = await requireProfile(discordId);
            return {
                member,
                total: assignments.length,
                pending: assignments.filter(isPending),
                completed: assignments.filter(isCompleted),
                late: assignments.filter(isLate),
            };
        },

        activeTasks: async (discordId: string): Promise<{ member: Member; tasks: readonly Task[] }> => {
            const { assignments, ...member } = await requireProfile(discordId);
            if (member.isDeboarded) throw new DomainError('MEMBER_DEBOARDED');
            if (assignments.length === 0) throw new DomainError('NO_TASKS');
            const tasks = assignments.filter(isOpen);
            if (tasks.length === 0) throw new DomainError('NO_ACTIVE_TASKS');
            return { member, tasks };
        },

        availability: async (discordId: string): Promise<Availability> => {
            const availability = await members.findAvailability(discordId);
            if (!availability) throw new DomainError('MEMBER_NOT_FOUND');
            return availability;
        },

        freeMembers: async (): Promise<FreeMembers> => {
            const free = await members.listFree();
            return {
                active: free.filter(({ isOnHiatus }) => !isOnHiatus),
                onHiatus: free.filter(({ isOnHiatus }) => isOnHiatus),
            };
        },
    };
};
