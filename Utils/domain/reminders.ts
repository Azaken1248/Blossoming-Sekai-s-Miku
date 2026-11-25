import type { DueReminder, ReminderThresholds, Task } from './model.ts';

const thresholdFor = (task: Task, thresholds: ReminderThresholds) => {
    const duration = task.deadline.getTime() - task.assignedAt.getTime();
    if (duration <= thresholds.SHORT_TASK.duration) return thresholds.SHORT_TASK;
    if (duration <= thresholds.MEDIUM_TASK.duration) return thresholds.MEDIUM_TASK;
    return thresholds.LONG_TASK;
};

export const dueReminder = (task: Task, thresholds: ReminderThresholds, now: Date): DueReminder | null => {
    const remaining = task.deadline.getTime() - now.getTime();
    const { firstReminder, finalReminder } = thresholdFor(task, thresholds);
    if (!task.firstReminderSent && remaining <= firstReminder) return { task, reminderType: 'first' };
    if (!task.finalReminderSent && remaining <= finalReminder) return { task, reminderType: 'final' };
    return null;
};
