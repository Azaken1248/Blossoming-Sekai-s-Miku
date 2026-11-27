import { taskTitle } from '../../Utils/domain/assignments.ts';
import type { Task } from '../../Utils/domain/model.ts';
import { formatStrikes } from '../../Utils/domain/strikes.ts';

interface Embeds {
    readonly embeds: readonly unknown[];
}

export const closed = ({ embeds }: Embeds, content: string) => ({ content, embeds, components: [] });

export const TASK_NOT_FOUND = { content: '❌ Task not found.' };
export const ALREADY_RESOLVED = '⚠️ That task has already been resolved.';

export const EXTENSION_REFUSALS: Partial<Record<string, string>> = {
    ALREADY_EXTENDED: '⚠️ That task has already used all of its extensions.',
    TASK_NOT_FOUND: '⚠️ That task no longer exists.',
    TASK_CHANGED: ALREADY_RESOLVED,
};

export const configProblem = (message: string): string =>
    `⚠️ Configuration error: ${message}. Please contact an admin.`;

export const decidedBy = (outcome: string, deciderId: string): string => `${outcome} by <@${deciderId}>`;

export const SUBMISSION_APPROVED = '✅ Submission approved';
export const EXTENSION_APPROVED = '✅ Extension approved';
export const HIATUS_APPROVED = '✅ Hiatus approved';
export const HIATUS_DENIED = '❌ Hiatus denied';

export const deniedOutcome = (action: string): string =>
    `❌ ${action === 'submit' ? 'Submission' : 'Extension'} denied`;

export const submissionApproved = (task: Task): string =>
    `✨ Congratulations <@${task.discordUserId}>! Your submission for **${taskTitle(task)}** has been approved! Amazing work~ ♪`;

export const submissionApprovedLog = (task: Task, strikes: number | null): string =>
    `✅ **${taskTitle(task)}** completed by <@${task.discordUserId}>! Amazing work~ Strike removed. Current: ${formatStrikes(strikes)} ♪`;

export const extensionApproved = (task: Task, ts: string): string =>
    `✨ Good news <@${task.discordUserId}>! Your extension request for **${taskTitle(task)}** has been approved! New deadline: <t:${ts}:F> ♪`;

export const extensionApprovedLog = (task: Task, ts: string): string =>
    `⏰ Extension granted for <@${task.discordUserId}> - **${taskTitle(task)}**! New deadline: <t:${ts}:F> ♪`;

export const taskDenied = (action: string, task: Task): string =>
    `<@${task.discordUserId}> Your ${action === 'submit' ? 'submission' : 'extension request'} for **${taskTitle(task)}** was not approved. Please check with staff for feedback! 💖`;

export const hiatusApproved = (userId: string): string =>
    `🌸 <@${userId}> Your hiatus request has been approved! All your tasks are paused. Take care and come back when you're ready~ ♪`;

export const hiatusApprovedLog = (userId: string, pausedCount: number): string =>
    `🏖️ Hiatus approved for <@${userId}>. All ${String(pausedCount)} pending task(s) paused. Take the time you need!`;

export const hiatusDenied = (userId: string): string =>
    `<@${userId}> Your hiatus request was not approved. Please reach out to staff if you have questions! 💖`;
