import type { StoredMember } from '../../DB/Schemas/user.ts';
import type { RepositoryDependencies } from './dependencies.ts';
import { toMember } from './mappers.ts';
import { decrementStrikes, incrementStrikes } from './strikeUpdates.ts';
import type { MemberRepository } from './types.ts';

type MemberLifecycle = Pick<MemberRepository, 'findOrCreate' | 'reactivate' | 'deboard' | 'addStrike' | 'removeStrike'>;

export const createMemberLifecycle = ({ members, clock }: RepositoryDependencies): MemberLifecycle => ({
    findOrCreate: async (discordId, username) => {
        const existing = await members.findOne({ discordId }).lean<StoredMember>();
        if (existing) return { member: toMember(existing), created: false };
        const { upsertedCount } = await members.updateOne(
            { discordId },
            { $setOnInsert: { username, strikes: 0, assignments: [], joinedAt: clock.now() } },
            { upsert: true },
        );
        const stored = await members.findOne({ discordId }).orFail().lean<StoredMember>();
        return { member: toMember(stored), created: upsertedCount === 1 };
    },

    reactivate: async (discordId, username) => {
        const stored = await members
            .findOneAndUpdate(
                { discordId },
                { isDeboarded: false, deboarded_at: null, ...(username ? { username } : {}) },
                { new: true },
            )
            .lean<StoredMember>();
        return stored ? toMember(stored) : null;
    },

    deboard: async (discordId, message) => {
        const stored = await members
            .findOneAndUpdate(
                { discordId, isDeboarded: { $ne: true } },
                { isDeboarded: true, deboarded_at: clock.now(), deboarded_statusMessage: message },
                { new: true },
            )
            .lean<StoredMember>();
        return stored ? toMember(stored) : null;
    },

    addStrike: (discordId) => incrementStrikes(members, { discordId }),

    removeStrike: (discordId) => decrementStrikes(members, { discordId }),
});
