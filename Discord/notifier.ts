import config from '../config.js';
import { heldCrewRoles } from '../Utils/domain/roles.ts';
import { shouldDemote } from '../Utils/domain/strikes.ts';
import type { GuildPort, Payload, Sendable, UserPort } from './ports.ts';
import { demotionDm, demotionLog, logLine } from './views/notifier.ts';

export const channelOf = (guild: GuildPort, channelId: string): Sendable | undefined =>
    guild.channels.cache.get(channelId);

export const logAction = async (guild: GuildPort, content: string, executorUser: UserPort): Promise<void> => {
    const channel = channelOf(guild, config.LOG_CHANNEL_ID);
    if (channel) {
        const timestamp = new Date().toLocaleTimeString();
        await channel.send(logLine(timestamp, executorUser.username, content)).catch(console.error);
    } else {
        console.warn(`[LOG-ACTION] ⚠️ Log channel ${config.LOG_CHANNEL_ID} not found! Content: ${content}`);
    }
};

export const postForApproval = async (guild: GuildPort, payload: Payload): Promise<void> => {
    const channel = channelOf(guild, config.APPROVAL_CHANNEL_ID);
    if (channel) await channel.send(payload);
};

export const notify = (guild: GuildPort, channelId: string | null | undefined, content: string): void => {
    if (!channelId) return;
    const channel = channelOf(guild, channelId);
    if (channel) void channel.send(content);
};

export const notifyLog = (guild: GuildPort, content: string): void => {
    notify(guild, config.LOG_CHANNEL_ID, content);
};

export const checkDemotion = async (guild: GuildPort, discordId: string, currentStrikes: number): Promise<void> => {
    if (!shouldDemote(currentStrikes)) return;

    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member) return;

    const crewRoles = heldCrewRoles([...member.roles.cache.keys()], config.CREW_ROLE_IDS);
    if (crewRoles.length === 0) return;

    await member.roles.remove(crewRoles).catch(() => {});
    await member.send(demotionDm).catch(() => {});
    notifyLog(guild, demotionLog(discordId));
};
