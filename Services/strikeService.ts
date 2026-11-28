import type { MemberRepository } from '../Utils/DBUtils/types.ts';
import { DomainError } from '../Utils/domain/errors.ts';
import type { Member } from '../Utils/domain/model.ts';

type Members = Pick<MemberRepository, 'findOrCreate' | 'addStrike' | 'removeStrike' | 'listWithStrikes'>;

export interface StrikeTarget {
    readonly discordId: string;
    readonly username: string;
}

export const createStrikeService = ({ members }: { readonly members: Members }) => {
    const change = async (
        { discordId, username }: StrikeTarget,
        apply: (discordId: string) => Promise<number | null>,
    ): Promise<{ strikes: number }> => {
        await members.findOrCreate(discordId, username);
        const strikes = await apply(discordId);
        if (strikes === null) throw new DomainError('MEMBER_NOT_FOUND');
        return { strikes };
    };

    return {
        add: (target: StrikeTarget) => change(target, members.addStrike),
        remove: (target: StrikeTarget) => change(target, members.removeStrike),
        list: (): Promise<Member[]> => members.listWithStrikes(),
        addExisting: (discordId: string) => members.addStrike(discordId),
        removeExisting: (discordId: string) => members.removeStrike(discordId),
    };
};

export type StrikeService = ReturnType<typeof createStrikeService>;
