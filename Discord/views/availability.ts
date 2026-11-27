import { EmbedBuilder } from 'discord.js';
import { taskTitle } from '../../Utils/domain/assignments.ts';
import type { Task } from '../../Utils/domain/model.ts';
import type { AvatarUser } from '../ports.ts';
import { chunkLines } from './format.ts';

export interface FreeMemberView {
    readonly discordId: string;
    readonly isOnHiatus: boolean;
    readonly lastTask: Task | null;
}

export interface AvailabilityView extends FreeMemberView {
    readonly isFree: boolean;
    readonly activeTask: Task | null;
}

const floorUnix = (date: Date): string => String(Math.floor(new Date(date).getTime() / 1000));

const statusLine = ({ isFree, isOnHiatus }: AvailabilityView): string =>
    `${isFree ? '✨' : '🔥'} Current Status: ${isFree ? '**FREE**' : '**BUSY**'}${isOnHiatus ? ` (On Hiatus 🏝️)` : ''}`;

const workField = ({ isOnHiatus, activeTask }: AvailabilityView) =>
    activeTask
        ? {
              name: 'Current Task',
              value: `**${taskTitle(activeTask)}**
Role: ${activeTask.roleName}
Deadline: <t:${floorUnix(activeTask.deadline)}:R>`,
              inline: false,
          }
        : {
              name: 'Ready for work?',
              value: isOnHiatus ? 'Checking in on hiatus! Take your time~' : 'Ready to take on a new challenge! ♪',
              inline: false,
          };

const lastTaskField = ({ lastTask }: AvailabilityView) => {
    if (!lastTask) return { name: 'History', value: 'No completed tasks yet. A fresh start!', inline: false };
    const whenLine = lastTask.completedAt
        ? `Completed: <t:${floorUnix(lastTask.completedAt)}:d>`
        : `Was due: <t:${floorUnix(lastTask.deadline)}:d>`;
    return { name: 'Last Completed Task', value: `**${taskTitle(lastTask)}**\n${whenLine}`, inline: false };
};

export const memberAvailability = (user: AvatarUser, status: AvailabilityView) => {
    const embed = new EmbedBuilder()
        .setTitle(`🎵 Availability Check: ${user.username}`)
        .setColor(status.isFree ? 0x39c5bb : 0xff5555)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setTimestamp()
        .setDescription(statusLine(status));
    embed.addFields(workField(status), lastTaskField(status));
    embed.setFooter({ text: status.isFree ? "Let's assign something fun! 💫" : 'Gambare! You can do it! ♪' });
    return { embeds: [embed] };
};

export const EVERYONE_BUSY = {
    content: 'Everyone seems to be busy with their tasks right now! Just like hard-working idols! ♪',
};

const freeLine = ({ discordId, lastTask }: FreeMemberView): string =>
    `• <@${discordId}> - ${lastTask ? `Last: *${taskTitle(lastTask)}*` : 'No prior tasks'}`;

const addChunked = (embed: EmbedBuilder, title: string, members: readonly FreeMemberView[]): void => {
    chunkLines(members.map(freeLine)).forEach((chunk, index) => {
        embed.addFields({ name: index === 0 ? title : `${title} (Cont.)`, value: chunk, inline: false });
    });
};

export const freeMembers = (active: readonly FreeMemberView[], onHiatus: readonly FreeMemberView[]) => {
    const embed = new EmbedBuilder()
        .setTitle('🎵 Available Users')
        .setColor(0x39c5bb)
        .setDescription('Here are the users with no active tasks~ Time to make some music! 🎤')
        .setTimestamp();
    addChunked(embed, '✨ Ready for Assignment', active);
    addChunked(embed, '🏝️ On Hiatus (Free)', onHiatus);
    embed.setFooter({ text: "Let's create something amazing together! 💫" });
    return { embeds: [embed] };
};

export const notFound = (targetId: string) => ({
    content: `I couldn't find any profile for <@${targetId}>. Maybe they haven't joined the team yet?`,
});

export const AVAILABILITY_FAILED = {
    content: 'O-Oh no! Something went wrong while checking for available users... 😢',
};
