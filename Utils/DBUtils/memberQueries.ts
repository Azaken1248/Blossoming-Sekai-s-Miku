import type { StoredMember } from '../../DB/Schemas/user.ts';
import type { MemberAndTasks, RepositoryDependencies } from './dependencies.ts';
import { toMember, toTask } from './mappers.ts';
import type { MemberRepository } from './types.ts';

type MemberQueries = Pick<MemberRepository, 'findByDiscordId' | 'findProfile' | 'isActive' | 'listWithStrikes'>;

export const createMemberQueries = ({ members }: RepositoryDependencies): MemberQueries => ({
    findByDiscordId: async (discordId) => {
        const stored = await members.findOne({ discordId }).lean<StoredMember>();
        return stored ? toMember(stored) : null;
    },

    findProfile: async (discordId) => {
        const stored = await members.findOne({ discordId }).populate('assignments').lean<MemberAndTasks>();
        return stored ? { ...toMember(stored), assignments: (stored.assignments ?? []).map(toTask) } : null;
    },

    isActive: async (discordId) => (await members.exists({ discordId, isDeboarded: { $ne: true } })) !== null,

    listWithStrikes: async () => {
        const stored = await members
            .find({ strikes: { $gt: 0 } })
            .sort({ strikes: -1 })
            .lean<StoredMember[]>();
        return stored.map(toMember);
    },
});
