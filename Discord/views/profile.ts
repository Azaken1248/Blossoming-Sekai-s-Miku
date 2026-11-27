import { EmbedBuilder } from 'discord.js';
import { taskTitle } from '../../Utils/domain/assignments.ts';
import type { Member, Task } from '../../Utils/domain/model.ts';
import { MAX_STRIKES, formatStrikes } from '../../Utils/domain/strikes.ts';
import type { AvatarUser } from '../ports.ts';
import { localDate, unix } from './format.ts';

export interface ProfileView {
    readonly member: Member;
    readonly total: number;
    readonly pending: readonly Task[];
    readonly completed: readonly Task[];
    readonly late: readonly Task[];
}

const avatar = (user: AvatarUser) => user.displayAvatarURL({ dynamic: true, size: 256 });

const titledList = (tasks: readonly Task[]) =>
    tasks.map((task) => `• ${taskTitle(task)} (${task.roleName})`).join('\n');

export const mikuProfile = (miku: AvatarUser) => ({
    embeds: [
        new EmbedBuilder()
            .setTitle('🎤 Hatsune Miku')
            .setColor(0x39c5bb)
            .setDescription('Oh! You want to know about me? Alright then!')
            .setThumbnail(avatar(miku))
            .addFields(
                {
                    name: 'About Me',
                    value: "I'm Hatsune Miku! I'm here to help everyone in this SEKAI work together and create something wonderful. Managing tasks, keeping track of deadlines, sending reminders... that's what I do!",
                    inline: false,
                },
                {
                    name: 'My Goal',
                    value: "I want everyone here to reach their full potential! When people work together and support each other, they can accomplish so much more. That's what I believe in!",
                    inline: false,
                },
                {
                    name: 'A Little Secret',
                    value: 'Between you and me... seeing everyone complete their tasks and grow makes me really happy. Keep up the great work, okay?',
                    inline: false,
                },
            )
            .setFooter({ text: "Now then, let's keep moving forward together!" })
            .setTimestamp(),
    ],
});

export const PROFILE_REFUSALS = { MEMBER_NOT_FOUND: () => 'User not found.' };

export const deboardedProfile = (user: AvatarUser, { member, completed }: ProfileView) => {
    const embed = new EmbedBuilder()
        .setTitle(`✨ ${member.deboardedMessage}`)
        .setThumbnail(avatar(user))
        .setColor(0xb9e2f0)
        .setDescription(`This member's adventure in our SEKAI has come to an end, but their legacy remains~ 🌸`)
        .addFields({ name: 'Deboarded', value: `<t:${String(unix(member.deboardedAt))}:F>`, inline: true })
        .addFields({ name: 'Completed Tasks', value: `✅ ${String(completed.length)}`, inline: true })
        .setFooter({
            text: `${localDate(member.joinedAt)} ~ ${localDate(member.deboardedAt)}`,
        })
        .setTimestamp();
    if (completed.length > 0) {
        embed.addFields({ name: '✅ Notable Works', value: titledList(completed.slice(-5).reverse()), inline: false });
    }
    return { embeds: [embed] };
};

const profileColor = ({ member, pending, completed }: ProfileView): number => {
    if (member.isOnHiatus) return 0xf9e2af;
    if (member.strikes >= MAX_STRIKES) return 0xf38ba8;
    if (member.strikes >= 2) return 0xfab387;
    if (pending.length === 0 && completed.length > 0) return 0xa6e3a1;
    return 0x89b4fa;
};

const activeList = (pending: readonly Task[]): string => {
    const lines = pending
        .slice(0, 5)
        .map(
            (task) =>
                `• **${taskTitle(task)}** (${task.roleName}) - <t:${String(unix(task.deadline))}:R>${task.hasExtended ? ' [Ext]' : ''}`,
        )
        .join('\n');
    return lines + (pending.length > 5 ? `\n*...and ${String(pending.length - 5)} more*` : '');
};

const profileHeader = (user: AvatarUser, view: ProfileView) =>
    new EmbedBuilder()
        .setTitle(`🌟 ${String(view.member.username)}'s Profile ♪`)
        .setThumbnail(avatar(user))
        .setColor(profileColor(view))
        .setFooter({ text: `🎵 Part of our SEKAI since ${localDate(view.member.joinedAt)}` })
        .setTimestamp()
        .addFields({ name: 'Status', value: view.member.isOnHiatus ? '🏖️ On Hiatus' : '✅ Active', inline: true })
        .addFields({ name: 'Strikes', value: `⚡ **${formatStrikes(view.member.strikes)}**`, inline: true })
        .addFields({ name: 'Total Tasks', value: `📊 ${String(view.total)}`, inline: true });

export const memberProfile = (user: AvatarUser, view: ProfileView, crewRoles: readonly string[]) => {
    const { pending, completed, late } = view;
    const embed = profileHeader(user, view);
    if (crewRoles.length > 0) {
        embed.addFields({
            name: '👥 Crew Roles',
            value: crewRoles.map((name) => `• ${name}`).join('\n'),
            inline: false,
        });
    }
    embed.addFields({
        name: 'Task Statistics',
        value: `✅ Completed: **${String(completed.length)}**\n🗒️ Pending: **${String(pending.length)}**\n❌ Late: **${String(late.length)}**`,
        inline: false,
    });
    if (pending.length > 0) embed.addFields({ name: '📝 Active Tasks', value: activeList(pending) });
    if (completed.length > 0) {
        embed.addFields({
            name: '✅ Recently Completed',
            value: titledList(completed.slice(-3).reverse()),
            inline: false,
        });
    }
    if (late.length > 0) {
        embed.addFields({ name: '⚠️ Warning', value: `${String(late.length)} task(s) marked as late`, inline: false });
    }
    return { embeds: [embed] };
};
