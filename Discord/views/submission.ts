import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';
import { taskTitle } from '../../Utils/domain/assignments.ts';
import type { Task } from '../../Utils/domain/model.ts';
import { unix } from './format.ts';
import type { Reply } from './permissions.ts';
import type { Wording } from './refusals.ts';

export const decisionRow = (action: string, id: string) =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`${action}_approve_${id}`).setLabel('Approve').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`${action}_deny_${id}`).setLabel('Deny').setStyle(ButtonStyle.Danger),
    );

export const taskPicker = (discordId: string, tasks: readonly Task[]) => {
    const select = new StringSelectMenuBuilder()
        .setCustomId(`submit_select_${discordId}`)
        .setPlaceholder('Select task(s) to submit...')
        .setMinValues(1)
        .setMaxValues(Math.min(tasks.length, 25))
        .addOptions(
            tasks.map((task) => ({
                label: `${taskTitle(task).substring(0, 90)}${task.status === 'LATE' ? ' [LATE]' : ''}`,
                description: `Role: ${task.roleName} | Due: ${new Date(task.deadline).toLocaleDateString()}`,
                value: task.id,
            })),
        );
    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
    return { content: `✨ Please select the task(s) you want to submit:`, components: [row] };
};

export const SUBMIT_REFUSALS: Wording = {
    NO_PENDING_TASKS: () => '⚠️ No pending assignments found for this user.',
    TASK_GONE: () => '⚠️ Task not found. It might have been already submitted or removed.',
    TASK_NAME_UNKNOWN: ({ taskName }) => `⚠️ Task '${taskName}' not found. Use \`/tasks\` to see available tasks.`,
};

const reviewEmbed = (discordId: string, task: Task, isLate: boolean) =>
    new EmbedBuilder()
        .setTitle(isLate ? '⚠️ Late Submission Ready for Review! ♪' : '✨ Submission Ready for Review! ♪')
        .setColor(isLate ? 0xfab387 : 0x39c5bb)
        .setDescription(
            isLate
                ? `<@${discordId}> has finished their task, although it was submitted after the deadline. Let's take a look~ 🎉`
                : `Yay! <@${discordId}> has finished their task and it's ready to shine! Let's take a look at this amazing work~ 🎉`,
        )
        .addFields(
            { name: 'Task', value: taskTitle(task), inline: true },
            { name: 'Role', value: task.roleName, inline: true },
            { name: 'Type', value: task.taskType, inline: true },
        )
        .setTimestamp();

export const submissionReview = (discordId: string, task: Task) => {
    const isLate = task.status === 'LATE';
    const embed = reviewEmbed(discordId, task, isLate);
    if (isLate) {
        embed.addFields({ name: '⏰ Original Deadline', value: `<t:${String(unix(task.deadline))}:R>`, inline: true });
    }
    if (task.description) {
        embed.addFields({ name: 'Description', value: task.description, inline: false });
    }
    return { embeds: [embed], components: [decisionRow('submit', task.id)] };
};

export const submitted = (task: Task): Reply => ({
    content: `✅ Yay! Your submission for **${taskTitle(task)}** has been sent for review! Keep up the amazing work~ ♪`,
});

export const picksSubmitted = (count: number) => ({
    content: `✅ Successfully sent ${String(count)} task(s) for review! Keep up the amazing work~ ♪`,
    embeds: [],
    components: [],
});
