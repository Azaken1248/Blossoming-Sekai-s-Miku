import type { MemberRepository } from '../Utils/DBUtils/types.ts';
import { DomainError } from '../Utils/domain/errors.ts';

interface Dependencies {
    readonly members: Pick<
        MemberRepository,
        'isActive' | 'findOrCreate' | 'reactivate' | 'findByDiscordId' | 'deboard'
    >;
    readonly defaultFarewell: string;
}

export interface OnboardResult {
    readonly status: 'created' | 'existing' | 'restored';
    readonly strikes: number;
}

export const createMembershipService = ({ members, defaultFarewell }: Dependencies) => ({
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
});
