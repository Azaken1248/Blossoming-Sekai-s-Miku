import { EmbedBuilder } from 'discord.js';
import type { UserPort } from '../ports.ts';
import type { Reply } from './permissions.ts';
import type { Wording } from './refusals.ts';
import { decisionRow } from './submission.ts';

export const REASON_MISSING = { content: '⚠️ Please provide a reason for the hiatus request.' };

export const grantedLog = (targetId: string, authorId: string, pausedCount: number): string =>
    `🏖️ Hiatus granted directly to <@${targetId}> by <@${authorId}>. All ${String(pausedCount)} pending task(s) paused.`;

export const grantedNotice = (targetId: string): string =>
    `🌸 <@${targetId}> You've been granted hiatus! All your tasks are paused. Take the time you need and come back when you're ready~ ♪`;

export const granted = (targetId: string, pausedCount: number): Reply => ({
    content: `✅ Hiatus granted to <@${targetId}>! All ${String(pausedCount)} pending task(s) have been paused.`,
});

const FOOTER_CHANNEL = /Channel: (\d+)/;

export const hiatusReview = (target: UserPort, reason: string, channelId: string | null) => {
    const embed = new EmbedBuilder()
        .setTitle('🏖️ Hiatus Request ♪')
        .setColor(0x39c5bb)
        .setDescription(`<@${target.id}> needs to take a little break. Taking care of yourself is important! 💖`)
        .addFields(
            { name: 'User', value: `<@${target.id}>`, inline: true },
            { name: 'Username', value: target.tag, inline: true },
            { name: 'Reason', value: reason, inline: false },
        )
        .setTimestamp();
    if (channelId) embed.setFooter({ text: `Channel: ${channelId}` });
    return { embeds: [embed], components: [decisionRow('hiatus', target.id)] };
};

export const requestChannelOf = (footerText: string | undefined): string | undefined =>
    footerText?.match(FOOTER_CHANNEL)?.[1];

export const REQUESTED = { content: `✅ Your hiatus request has been sent for review! I hope everything is okay~ ♪` };

export const endRefusals = (targetId: string): Wording => ({
    MEMBER_NOT_FOUND: () => '❌ User not found.',
    NOT_ON_HIATUS: () => `⚠️ <@${targetId}> is not currently on hiatus, so there are no paused deadlines to restore.`,
});

export const endedLog = (targetId: string, restored: number, skipped: number): string =>
    restored === 0 && skipped === 0
        ? `🌸 Welcome back! Ended hiatus for <@${targetId}>`
        : `🌸 Welcome back! Ended hiatus for <@${targetId}> - restored ${String(restored)} task(s)` +
          (skipped ? `, ${String(skipped)} need a manual deadline` : '');

export const ended = (targetId: string, restored: number, skipped: readonly string[]): Reply => {
    if (restored === 0 && skipped.length === 0) return { content: `✅ Hiatus ended for <@${targetId}>.` };
    let content = `✅ Hiatus ended for <@${targetId}>.\n⏰ Set new deadlines for ${String(restored)} task(s) based on their task types. Welcome back! ♪`;
    if (skipped.length) {
        content += `\n\n⚠️ These task(s) have no configured duration and are still paused — please set their deadlines manually with a new assignment:\n${skipped.map((name) => `• **${name}**`).join('\n')}`;
    }
    return { content };
};
