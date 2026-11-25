import type { Clock, MemberRepository } from '../Utils/DBUtils/types.ts';
import { freshDeadline, taskTitle } from '../Utils/domain/assignments.ts';
import { DomainError } from '../Utils/domain/errors.ts';
import type { RoleRules } from '../Utils/domain/model.ts';

interface Dependencies {
    readonly members: Pick<MemberRepository, 'findByDiscordId' | 'startHiatus' | 'endHiatus'>;
    readonly rules: RoleRules;
    readonly clock: Clock;
}

export interface HiatusEnded {
    readonly restored: readonly string[];
    readonly skipped: readonly string[];
}

export const createHiatusService = ({ members, rules, clock }: Dependencies) => ({
    start: async (discordId: string): Promise<{ pausedCount: number }> => ({
        pausedCount: await members.startHiatus(discordId),
    }),

    end: async (discordId: string): Promise<HiatusEnded> => {
        const member = await members.findByDiscordId(discordId);
        if (!member) throw new DomainError('MEMBER_NOT_FOUND');
        const ended = member.isOnHiatus
            ? await members.endHiatus(discordId, (task) => freshDeadline(task, rules, clock.now()))
            : null;
        if (!ended) throw new DomainError('NOT_ON_HIATUS');
        return { restored: ended.restored.map(taskTitle), skipped: ended.skipped.map(taskTitle) };
    },
});

export type HiatusService = ReturnType<typeof createHiatusService>;
