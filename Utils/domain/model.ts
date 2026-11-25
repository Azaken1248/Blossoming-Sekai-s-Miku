export const TASK_STATUS = {
    Pending: 'PENDING',
    Completed: 'COMPLETED',
    Late: 'LATE',
    Excused: 'EXCUSED',
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

export const CUSTOM_TASK_TYPE = 'custom';

export interface Task {
    readonly id: string;
    readonly memberId: string;
    readonly discordUserId: string;
    readonly roleCategoryId: string;
    readonly roleName: string;
    readonly taskType: string;
    readonly taskName: string;
    readonly description: string;
    readonly assignedAt: Date;
    readonly deadline: Date;
    readonly hasExtended: boolean;
    readonly extensionCount: number;
    readonly customExtension: number | null;
    readonly submissionChannelId: string | null;
    readonly firstReminderSent: boolean;
    readonly finalReminderSent: boolean;
    readonly status: TaskStatus;
    readonly completedAt: Date | null;
}

export interface Member {
    readonly id: string;
    readonly discordId: string;
    readonly username: string | null;
    readonly strikes: number;
    readonly isOnHiatus: boolean;
    readonly isDeboarded: boolean;
    readonly deboardedAt: Date | null;
    readonly deboardedMessage: string;
    readonly roles: readonly string[];
    readonly joinedAt: Date;
}

export interface RoleRule {
    readonly name: string;
    readonly tasks: Readonly<Record<string, number>>;
    readonly extension?: number | undefined;
    readonly extension_skit?: number | undefined;
    readonly extension_story?: number | undefined;
    readonly extension_mv?: number | undefined;
}

export type RoleRules = Readonly<Record<string, RoleRule>>;

export type ReminderType = 'first' | 'final';

export interface DueReminder {
    readonly task: Task;
    readonly reminderType: ReminderType;
}

interface ReminderThreshold {
    readonly duration: number;
    readonly firstReminder: number;
    readonly finalReminder: number;
}

export interface ReminderThresholds {
    readonly SHORT_TASK: ReminderThreshold;
    readonly MEDIUM_TASK: ReminderThreshold;
    readonly LONG_TASK: Omit<ReminderThreshold, 'duration'>;
}
