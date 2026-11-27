import { taskTitle } from '../../Utils/domain/assignments.ts';
import type { ReminderType, Task } from '../../Utils/domain/model.ts';
import { unix } from './format.ts';

export const reminder = (task: Task, reminderType: ReminderType, daysLeft: number): string => {
    const deadlineTs = String(unix(task.deadline));
    const final = reminderType === 'final';
    const reminderEmoji = final ? '🚨' : '⏰';
    const reminderLabel = final ? '**FINAL REMINDER**' : '**Friendly Reminder**';
    const encouragement = final
        ? "You can do this! The deadline is almost here, so let's give it our all~ ♪"
        : 'Keep up the great work! ♪';
    return `${reminderEmoji} ${reminderLabel}\n<@${task.discordUserId}> Your task **${taskTitle(task)}** (${task.roleName}) is due in **${String(daysLeft)} day(s)**!\n${encouragement}\n📅 Deadline: <t:${deadlineTs}:F> (<t:${deadlineTs}:R>)`;
};

export const deadlineMissed = (task: Task, strikes: number): string =>
    `💔 **Oh no... Deadline Missed**\n<@${task.discordUserId}> The deadline for **${taskTitle(task)}** has passed...\nStrike added. Total: ${String(strikes)}/3\nLet's work together to stay on track next time, okay? ♪`;
