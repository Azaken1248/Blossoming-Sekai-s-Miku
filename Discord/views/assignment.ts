import { ActionRowBuilder, UserSelectMenuBuilder } from 'discord.js';
import type { Task } from '../../Utils/domain/model.ts';
import type { Reply } from './permissions.ts';
import { unix } from './format.ts';
import type { Wording } from './refusals.ts';

export const ASSIGN_REFUSALS: Wording = {
    CUSTOM_DURATION_REQUIRED: () => '❌ For custom tasks, you must specify duration_days (greater than 0).',
    CUSTOM_FIELDS_NOT_ALLOWED: () =>
        '❌ duration_days and extension_days are only for Custom tasks. For standard tasks, duration is automatically set based on the task type.',
    MEMBER_NOT_IN_GUILD: () => '❌ User not found in server.',
    ROLE_MISSING: ({ roleName }) => `❌ User doesn't have the '${roleName}' role.`,
    TASK_TYPE_INVALID: ({ taskType, roleName, validTasks }) =>
        `❌ Task type '${taskType}' is not valid for role '${roleName}'.\nValid tasks: ${validTasks.join(', ')}`,
};

export const assignedLog = (task: Task, targetId: string): string =>
    `✨ Assigned **${task.taskType}** to <@${targetId}> - Let's create something wonderful!`;

export const assigned = (task: Task, targetId: string): Reply => {
    const ts = String(unix(task.deadline));
    return {
        content: `✨ Assigned **${task.taskType}** to <@${targetId}>! Let's create something wonderful together!\n📅 Deadline: <t:${ts}:F> (<t:${ts}:R>)`,
    };
};

export const removeRefusals = (targetId: string): Wording => ({
    TASK_NOT_FOUND: () => `❌ Task not found for <@${targetId}>. Use \`/tasks @user\` to see available tasks.`,
    TASK_IS_PERMANENT: ({ title }) =>
        `❌ Cannot delete **${title}** - this task has been completed and is now part of the permanent record! Their work will be remembered~ 🌸`,
});

export const removedLog = (title: string, targetId: string): string =>
    `🗑️ Removed task **${title}** from <@${targetId}>`;

export const removed = (title: string, targetId: string): Reply => ({
    content: `✅ Task **${title}** has been removed for <@${targetId}>. Their work remains in the archives~ 🌸`,
});

export interface BulkRequest {
    readonly roleName: string;
    readonly taskType: string;
    readonly taskName: string;
    readonly description: string;
}

export const bulkPicker = (operationId: string, { taskType, roleName }: BulkRequest) => ({
    content: `✨ **Bulk Assigning: ${taskType} (${roleName})**\nPlease select up to 25 users to assign this task to:`,
    components: [
        new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
            new UserSelectMenuBuilder()
                .setCustomId(`bulkassign_select_${operationId}`)
                .setPlaceholder('Select users to assign this task to...')
                .setMinValues(1)
                .setMaxValues(25),
        ),
    ],
    flags: 64,
});

export const BULK_EXPIRED = { content: '⚠️ This bulk assign session has expired. Please try again.', components: [] };
export const BULK_NOT_YOURS = { content: 'You cannot use this menu.', components: [] };
export const BULK_NONE_PICKED = { content: 'No users selected.', components: [] };

export const bulkAssignedDm = ({ taskType, roleName, taskName, description }: BulkRequest): string =>
    `✨ **You've been assigned a new task!**\n**Type:** ${taskType}\n**Role:** ${roleName}${taskName ? `\n**Name:** ${taskName}` : ''}${description ? `\n**Description:** ${description}` : ''}\nLet's do our best! ♪`;

export const bulkAssignedLog = ({ taskType, roleName }: BulkRequest, assignedIds: readonly string[]): string =>
    `✨ **Bulk Assigned ${taskType} (${roleName})** to: ${assignedIds.map((id) => `<@${id}>`).join(', ')}`;

export interface BulkFailure {
    readonly userId: string;
    readonly reason: string;
}

export const bulkResult = (assignedCount: number, failures: readonly BulkFailure[]) => {
    let content = `✅ **Bulk Assign Complete!**\n\nSuccessfully assigned to ${String(assignedCount)} user(s).`;
    if (failures.length > 0) {
        content +=
            `\n\n⚠️ **Failed for ${String(failures.length)} user(s):**\n` +
            failures.map((failure) => `• <@${failure.userId}>: ${failure.reason}`).join('\n');
    }
    return { content, components: [] };
};
