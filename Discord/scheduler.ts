import config from '../config.js';
import { reminderService } from '../Services/index.ts';
import type { OverdueSkip } from '../Services/reminderService.ts';
import { taskTitle } from '../Utils/domain/assignments.ts';
import { DAY, HOUR, MINUTE } from '../Utils/domain/durations.ts';
import type { ReminderType, Task } from '../Utils/domain/model.ts';
import { formatStrikes } from '../Utils/domain/strikes.ts';
import { channelOf, checkDemotion } from './notifier.ts';
import type { GuildPort } from './ports.ts';

export interface SchedulerClient {
    readonly guilds: { readonly cache: { first(): GuildPort | undefined } };
}

const BANNER = '========================================';
const RULE = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

const logPendingAnalysis = (pendingTasks: readonly Task[]): void => {
    console.log(`[REMINDERS] Total pending tasks in DB: ${String(pendingTasks.length)}`);
    if (pendingTasks.length > 0) {
        const now = Date.now();
        console.log('[REMINDERS] Task analysis:');
        for (const t of pendingTasks) {
            const timeLeft = t.deadline.getTime() - now;
            const duration = t.deadline.getTime() - t.assignedAt.getTime();
            console.log(`[REMINDERS]   - "${taskTitle(t)}" | User: ${t.discordUserId}`);
            console.log(
                `[REMINDERS]     Time until deadline: ${String(Math.round(timeLeft / 1000))}s (${String(Math.round(timeLeft / 60000))}m)`,
            );
            console.log(
                `[REMINDERS]     Task duration: ${String(Math.round(duration / 1000))}s (${String(Math.round(duration / DAY))}d)`,
            );
            console.log(
                `[REMINDERS]     First reminder sent: ${String(t.firstReminderSent)}, Final: ${String(t.finalReminderSent)}`,
            );
        }
    }
    console.log();
};

const reminderText = (task: Task, reminderType: ReminderType, daysLeft: number): string => {
    const deadlineTs = Math.round(task.deadline.getTime() / 1000);
    const final = reminderType === 'final';
    const reminderEmoji = final ? '🚨' : '⏰';
    const reminderLabel = final ? '**FINAL REMINDER**' : '**Friendly Reminder**';
    const encouragement = final
        ? "You can do this! The deadline is almost here, so let's give it our all~ ♪"
        : 'Keep up the great work! ♪';
    return `${reminderEmoji} ${reminderLabel}\n<@${task.discordUserId}> Your task **${taskTitle(task)}** (${task.roleName}) is due in **${String(daysLeft)} day(s)**!\n${encouragement}\n📅 Deadline: <t:${String(deadlineTs)}:F> (<t:${String(deadlineTs)}:R>)`;
};

const sendReminder = async (guild: GuildPort, task: Task, reminderType: ReminderType): Promise<void> => {
    console.log(`[REMINDER-CHECK] Task: "${taskTitle(task)}" | User: ${task.discordUserId}`);
    console.log(`[REMINDER-CHECK]   Role: ${task.roleName} | Type: ${reminderType.toUpperCase()}`);
    console.log(`[REMINDER-CHECK]   Deadline: ${task.deadline.toISOString()}`);
    const timeUntilDeadline = task.deadline.getTime() - Date.now();
    const daysLeft = Math.ceil(timeUntilDeadline / DAY);
    console.log(
        `[REMINDER-CHECK]   ⏰ Time remaining: ${String(daysLeft)}d ${String(Math.ceil(timeUntilDeadline / HOUR))}h ${String(Math.ceil(timeUntilDeadline / MINUTE))}m`,
    );
    const reminderChannel = channelOf(guild, config.REMINDER_CHANNEL_ID);
    if (reminderChannel) {
        console.log(
            `[REMINDER-CHECK]   📤 Sending ${reminderType} reminder to channel ${config.REMINDER_CHANNEL_ID}...`,
        );
        await reminderChannel.send(reminderText(task, reminderType, daysLeft));
        console.log(`[REMINDER-CHECK]   ✅ Reminder sent successfully`);
    } else {
        console.log(`[REMINDER-CHECK]   ❌ ERROR - Reminder channel not found (${config.REMINDER_CHANNEL_ID})`);
    }
};

const runReminders = async (guild: GuildPort): Promise<void> => {
    console.log('[REMINDERS] 📋 Fetching tasks that need reminders...');
    const { done, skipped } = await reminderService.sendReminders({
        send: (task, reminderType) => sendReminder(guild, task, reminderType),
        skip: (task) => {
            console.log(`[REMINDER-CHECK] Task: "${taskTitle(task)}" | User: ${task.discordUserId}`);
            console.log(`[REMINDER-CHECK]   ⏸️  SKIPPED - User is on hiatus\n`);
        },
    });
    console.log(`[REMINDERS] ${RULE}`);
    console.log(`[REMINDERS] 📊 Summary: ${String(done)} sent, ${String(skipped)} skipped`);
    console.log(`[REMINDERS] ${RULE}\n`);
};

const OVERDUE_SKIPS: Record<OverdueSkip, (taskId: string) => void> = {
    hiatus: () => {
        console.log(`[OVERDUE-CHECK]   ⏸️  SKIPPED - User is on hiatus\n`);
    },
    orphaned: (taskId) => {
        console.warn(`[OVERDUE-CHECK]   ⚠️ SKIPPED - assignment ${taskId} references a user that no longer exists\n`);
    },
    changed: () => {
        console.log(`[OVERDUE-CHECK]   ⏸️  SKIPPED - Task changed since it was read\n`);
    },
    noMemberRecord: () => {
        console.warn(`[OVERDUE-CHECK]   ⚠️ Could not apply strike - user record missing\n`);
    },
};

const announceOverdue = async (guild: GuildPort, task: Task, strikes: number): Promise<void> => {
    console.log(`[OVERDUE-CHECK] Task: "${taskTitle(task)}" | User: ${task.discordUserId}`);
    console.log(`[OVERDUE-CHECK]   ⚡ Marked task as LATE. New total: ${formatStrikes(strikes)}`);
    const logChannel = channelOf(guild, config.LOG_CHANNEL_ID);
    if (logChannel) {
        await logChannel.send(
            `💔 **Oh no... Deadline Missed**\n<@${task.discordUserId}> The deadline for **${taskTitle(task)}** has passed...\nStrike added. Total: ${String(strikes)}/3\nLet's work together to stay on track next time, okay? ♪`,
        );
        console.log(`[OVERDUE-CHECK]   ✅ Notification sent`);
    } else {
        console.log(`[OVERDUE-CHECK]   ❌ ERROR - Log channel not found (${config.LOG_CHANNEL_ID})`);
    }
    await checkDemotion(guild, task.discordUserId, strikes);
    console.log(`[OVERDUE-CHECK]   ✅ Demotion check complete\n`);
};

const runOverdue = async (guild: GuildPort): Promise<void> => {
    console.log('[OVERDUE] 📋 Fetching overdue tasks...');
    const { done, skipped } = await reminderService.strikeOverdue({
        struck: (task, strikes) => announceOverdue(guild, task, strikes),
        skip: (task, reason) => {
            console.log(`[OVERDUE-CHECK] Task: "${taskTitle(task)}" | User: ${task.discordUserId}`);
            OVERDUE_SKIPS[reason](task.id);
        },
    });
    console.log(`[OVERDUE] ${RULE}`);
    console.log(`[OVERDUE] 📊 Summary: ${String(done)} processed, ${String(skipped)} skipped`);
    console.log(`[OVERDUE] ${RULE}\n`);
};

export const runScheduler = async (client: SchedulerClient, isStartup = false): Promise<void> => {
    console.log(`\n${BANNER}`);
    console.log(`[SCHEDULER] Running at ${new Date().toISOString()}`);
    if (isStartup) console.log('[SCHEDULER] 🚀 STARTUP CHECK - Catching up on missed reminders...');
    console.log(`${BANNER}\n`);

    const guild = client.guilds.cache.first();
    if (!guild) {
        console.log('[SCHEDULER] ⚠️ No guild found. Skipping scheduler run.');
        return;
    }

    console.log('[REMINDERS] 📋 Fetching all pending tasks for analysis...');
    logPendingAnalysis(await reminderService.pending());
    await runReminders(guild);
    await runOverdue(guild);

    console.log(BANNER);
    console.log(`[SCHEDULER] ✅ Completed at ${new Date().toISOString()}`);
    console.log(`${BANNER}\n`);
};

export const startScheduler = async (client: SchedulerClient): Promise<void> => {
    console.log('[STARTUP] Running initial scheduler check to catch up on missed reminders...');
    try {
        await runScheduler(client, true);
        console.log('[STARTUP] ✅ Initial check complete\n');
    } catch (e) {
        console.error('[STARTUP] ❌ Error during initial scheduler check:', e);
    }

    console.log('[STARTUP] Setting up scheduler...');
    setInterval(() => {
        runScheduler(client).catch((err: unknown) => {
            console.error('[SCHEDULER] ❌ Run failed:', err);
        });
    }, config.SCHEDULER_INTERVAL_MINUTES * MINUTE);
    console.log(`[STARTUP] ✅ Scheduler will run every ${String(config.SCHEDULER_INTERVAL_MINUTES)} minutes\n`);
};
