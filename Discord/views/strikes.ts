import { EmbedBuilder } from 'discord.js';
import type { Member } from '../../Utils/domain/model.ts';
import { MAX_STRIKES, formatStrikes } from '../../Utils/domain/strikes.ts';
import type { Reply } from './permissions.ts';
import type { Wording } from './refusals.ts';

export const strikeRefusals = (targetId: string): Wording => ({
    MEMBER_NOT_FOUND: () => `❌ Could not find a record for <@${targetId}>.`,
});

export const strikeAddedLog = (targetId: string, reason: string | null): string =>
    `⚡ Added strike to <@${targetId}>. Reason: ${String(reason)}`;

export const strikeAdded = (targetId: string, reason: string | null, strikes: number): Reply => {
    const capped = strikes >= MAX_STRIKES ? `\n*(already at the maximum of ${String(MAX_STRIKES)})*` : '';
    return {
        content: `⛔ Strike added to <@${targetId}>.\nReason: **${String(reason)}**\nTotal: **${formatStrikes(strikes)}**${capped}`,
    };
};

export const strikeRemovedLog = (targetId: string): string =>
    `✨ Removed strike from <@${targetId}> - Great improvement!`;

export const strikeRemoved = (targetId: string, strikes: number): Reply => ({
    content: `✅ Strike removed for <@${targetId}>.\nTotal: **${formatStrikes(strikes)}**`,
});

export const UNKNOWN_STRIKE_ACTION = { content: '⚠️ Unknown strike action. Use `add`, `remove` or `list`.' };

export const NO_STRIKES = {
    content: '✨ Wonderful news! No one currently has any strikes. Everyone is doing amazing work! ♪',
};

export const strikeList = (members: readonly Member[]) => {
    const description = members
        .map((member) => `• <@${member.discordId}>: **${String(member.strikes)}** strike(s)`)
        .join('\n');
    return {
        embeds: [
            new EmbedBuilder()
                .setTitle('⚠️ active Strikes List')
                .setColor(0xff6b6b)
                .setDescription(
                    `Here is the list of users with active strikes.\nLet's do our best to clear them!\n\n${description}`,
                )
                .setFooter({ text: 'Keep doing your best everyone! ♪' })
                .setTimestamp(),
        ],
    };
};
