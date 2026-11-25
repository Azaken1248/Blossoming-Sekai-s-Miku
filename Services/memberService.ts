import type { Availability, FreeMember, MemberProfile, MemberRepository } from '../Utils/DBUtils/types.ts';
import { isCompleted, isLate, isOpen, isPending } from '../Utils/domain/assignments.ts';
import { DomainError } from '../Utils/domain/errors.ts';
import type { Member, Task } from '../Utils/domain/model.ts';

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

interface Dependencies {
    readonly members: Members;
    readonly defaultFarewell: string;
}

export interface OnboardResult {
    readonly status: 'created' | 'existing' | 'restored';
    readonly strikes: number;
}

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

export const createMemberService = ({ members, defaultFarewell }: Dependencies) => {
    const requireProfile = async (discordId: string): Promise<MemberProfile> => {
        const profile = await members.findProfile(discordId);
        if (!profile) throw new DomainError('MEMBER_NOT_FOUND');
        return profile;
    };

    return {
        isOnboarded: (discordId: string): Promise<boolean> => members.isActive(discordId),

        onboard: async (discordId: string, username: string): Promise<OnboardResult> => {
            const { member, created } = await members.findOrCreate(discordId, username);
            if (created) return { status: 'created', strikes: member.strikes };
            if (!member.isDeboarded) return { status: 'existing', strikes: member.strikes };
            const restored = await members.reactivate(discordId, username);
            return { status: 'restored', strikes: restored?.strikes ?? member.strikes };
        },

        deboard: async (discordId: string, message: string | null): Promise<{ statusMessage: string }> => {
            const member = await members.findByDiscordId(discordId);
            if (!member) throw new DomainError('MEMBER_NOT_FOUND');
            const deboarded = member.isDeboarded ? null : await members.deboard(discordId, message || defaultFarewell);
            if (!deboarded) throw new DomainError('MEMBER_ALREADY_DEBOARDED');
            return { statusMessage: deboarded.deboardedMessage };
        },

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

export type MemberService = ReturnType<typeof createMemberService>;
