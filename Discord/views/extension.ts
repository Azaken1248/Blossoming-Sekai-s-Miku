import { EmbedBuilder } from 'discord.js';
import { taskTitle } from '../../Utils/domain/assignments.ts';
import { MAX_EXTENSIONS_PER_TASK, msToDays } from '../../Utils/domain/extensions.ts';
import type { Task } from '../../Utils/domain/model.ts';
import { unix } from './format.ts';
import type { Reply } from './permissions.ts';
import type { Wording } from './refusals.ts';
import { decisionRow } from './submission.ts';

export const EXTENSION_REFUSALS: Wording = {
    ALREADY_EXTENDED: () =>
        `⚠️ This task has already been extended the maximum number of times (${String(MAX_EXTENSIONS_PER_TASK)}).`,
    CONFIG_MISSING_ROLE: (_details, { message }) => `⚠️ Configuration error: ${message}. Please contact an admin.`,
    NO_PENDING_TASKS: () => '⚠️ No pending assignments found.',
    REASON_REQUIRED: () => '⚠️ Please provide a reason for the extension request.',
    TASK_AMBIGUOUS: ({ tasks }) => {
        const taskList = tasks.map((task) => `• **${taskTitle(task)}** (${task.roleName})`).join('\n');
        return `⚠️ Please specify which task:\n${taskList}\n\nUse: \`/extension task:<task_name> reason:<reason>\``;
    },
    TASK_NAME_UNKNOWN: ({ taskName }) => `⚠️ Task '${taskName}' not found.`,
};

export const extensionReview = (discordId: string, task: Task, extensionMs: number | undefined, reason: string) => {
    const embed = new EmbedBuilder()
        .setTitle('🌸 Extension Request ♪')
        .setColor(0x39c5bb)
        .setDescription(
            `<@${discordId}> needs a bit more time to make something truly special! Everyone deserves the time to do their best~ ✨`,
        )
        .addFields(
            { name: 'Task', value: taskTitle(task), inline: true },
            { name: 'Role', value: task.roleName, inline: true },
            { name: 'Extension', value: `${String(msToDays(Number(extensionMs)))} days`, inline: true },
            { name: 'Current Deadline', value: `<t:${String(unix(task.deadline))}:F>`, inline: false },
            { name: 'Reason', value: reason, inline: false },
        )
        .setTimestamp();
    return { embeds: [embed], components: [decisionRow('extension', task.id)] };
};

export const extensionRequested = (task: Task): Reply => ({
    content: `✅ Extension request sent for **${taskTitle(task)}**! Don't worry, everyone needs extra time sometimes~ ♪`,
});
