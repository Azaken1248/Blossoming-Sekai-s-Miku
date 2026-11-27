import config from '../config.js';
import { heldCrewRoles } from '../Utils/domain/roles.ts';
import { MAX_STRIKES, shouldDemote } from '../Utils/domain/strikes.ts';
import type { GuildPort, Sendable, UserPort } from './ports.ts';

export const channelOf = (guild: GuildPort, channelId: string): Sendable | undefined =>
    guild.channels.cache.get(channelId);

export const logAction = async (guild: GuildPort, content: string, executorUser: UserPort): Promise<void> => {
    const channel = channelOf(guild, config.LOG_CHANNEL_ID);
    if (channel) {
        const timestamp = new Date().toLocaleTimeString();
        await channel.send(`\`[${timestamp}]\` 🎵 **${executorUser.username}**: ${content}`).catch(console.error);
    } else {
        console.warn(`[LOG-ACTION] ⚠️ Log channel ${config.LOG_CHANNEL_ID} not found! Content: ${content}`);
    }
};

export const checkDemotion = async (guild: GuildPort, discordId: string, currentStrikes: number): Promise<void> => {
    if (!shouldDemote(currentStrikes)) return;

    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member) return;

    const crewRoles = heldCrewRoles([...member.roles.cache.keys()], config.CREW_ROLE_IDS);
    if (crewRoles.length === 0) return;

    await member.roles.remove(crewRoles).catch(() => {});
    await member
        .send(
            `🚨 **Important Notice:** You've reached ${String(MAX_STRIKES)} strikes and your crew roles have been removed. Don't give up though - you can always make a comeback! ♪`,
        )
        .catch(() => {});
    const channel = channelOf(guild, config.LOG_CHANNEL_ID);
    if (channel)
        void channel.send(
            `🚨 **Demotion Notice** - <@${discordId}> has reached ${String(MAX_STRIKES)} strikes and crew roles have been removed.`,
        );
};
