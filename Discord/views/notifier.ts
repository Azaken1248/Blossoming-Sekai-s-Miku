import { MAX_STRIKES } from '../../Utils/domain/strikes.ts';

export const logLine = (timestamp: string, username: string, content: string): string =>
    `\`[${timestamp}]\` 🎵 **${username}**: ${content}`;

export const demotionDm = `🚨 **Important Notice:** You've reached ${String(MAX_STRIKES)} strikes and your crew roles have been removed. Don't give up though - you can always make a comeback! ♪`;

export const demotionLog = (discordId: string): string =>
    `🚨 **Demotion Notice** - <@${discordId}> has reached ${String(MAX_STRIKES)} strikes and crew roles have been removed.`;
