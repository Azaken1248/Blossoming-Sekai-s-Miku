import { EmbedBuilder } from 'discord.js';
import { taskTitle } from '../../Utils/domain/assignments.ts';
import type { Member, Task } from '../../Utils/domain/model.ts';
import { unix } from './format.ts';
import type { Wording } from './refusals.ts';

export const tasksRefusals = (targetId: string): Wording => ({
    MEMBER_NOT_FOUND: () => 'User not found.',
    MEMBER_DEBOARDED: () =>
        `This member has been deboarded and is no longer part of the active SEKAI. Their completed tasks are archived for remembrance~ ✨`,
    NO_TASKS: () => `<@${targetId}> has no tasks.`,
    NO_ACTIVE_TASKS: () => `<@${targetId}> has no active tasks.`,
});

const taskField = (task: Task, onHiatus: boolean) => {
    const ts = String(unix(task.deadline));
    const deadline = onHiatus ? 'N/A (On Hiatus)' : `<t:${ts}:F> (<t:${ts}:R>)`;
    const extended = task.hasExtended ? ' [Extended]' : '';
    const late = task.status === 'LATE' ? ' ⚠️ [LATE]' : '';
    const role = task.roleName || 'N/A';
    let value = `**Type:** ${task.taskType}\n**Role:** ${role}\n**Deadline:** ${deadline}${extended}${late}`;
    if (task.description) value += `\n**Description:** ${task.description}`;
    return { name: taskTitle(task), value, inline: false };
};

export const activeTasks = (member: Member, tasks: readonly Task[]) => {
    const embed = new EmbedBuilder()
        .setTitle(`🎶 ${String(member.username)}'s Active Tasks ♪`)
        .setDescription("Here are all the wonderful things you're working on! Keep up the great work~ ✨")
        .setColor(0x39c5bb);
    for (const task of tasks) embed.addFields(taskField(task, member.isOnHiatus));
    return { embeds: [embed] };
};
