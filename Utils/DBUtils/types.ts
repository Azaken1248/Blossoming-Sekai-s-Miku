import type { DueReminder, Member, ReminderThresholds, ReminderType, Task } from '../domain/model.ts';

export interface MemberProfile extends Member {
    readonly assignments: readonly Task[];
}

export interface TaskWithMember extends Task {
    readonly member: Member | null;
}

export interface NewTask {
    readonly memberId: string;
    readonly discordUserId: string;
    readonly roleCategoryId: string;
    readonly roleName: string;
    readonly taskType: string;
    readonly taskName?: string;
    readonly description?: string;
    readonly deadline: Date;
    readonly customExtension?: number | null;
}

export interface HistoryFilters {
    readonly discordUserId?: string | null;
    readonly taskName?: string | null;
    readonly status?: string | null;
    readonly roleName?: string | null;
    readonly limit?: number | null;
}

export interface FreeMember {
    readonly discordId: string;
    readonly username: string | null;
    readonly isOnHiatus: boolean;
    readonly lastTask: Task | null;
}

export interface Availability extends FreeMember {
    readonly isFree: boolean;
    readonly activeTask: Task | null;
}

export type MarkLateResult =
    { readonly outcome: 'skipped' } | { readonly outcome: 'late'; readonly strikes: number | null };

export type RemoveResult = 'removed' | 'completed' | 'missing';

export interface CompletedTask {
    readonly task: Task;
    readonly strikes: number | null;
}

export interface HiatusEnd {
    readonly restored: readonly Task[];
    readonly skipped: readonly Task[];
}

export interface Clock {
    now(): Date;
}

export interface TaskRepository {
    create(task: NewTask): Promise<Task>;
    findById(id: string): Promise<TaskWithMember | null>;
    findByIdentifier(discordUserId: string, identifier: string): Promise<Task | null>;
    listPending(): Promise<Task[]>;
    listOverdue(): Promise<TaskWithMember[]>;
    listDueReminders(thresholds: ReminderThresholds): Promise<DueReminder[]>;
    listHistory(filters?: HistoryFilters): Promise<TaskWithMember[]>;
    markReminderSent(id: string, reminderType: ReminderType): Promise<void>;
    setSubmissionChannel(id: string, channelId: string): Promise<void>;
    complete(id: string): Promise<Task | null>;
    completeAndForgive(id: string): Promise<CompletedTask | null>;
    extend(id: string, extensionMs: number): Promise<Task>;
    markLateAndStrike(id: string): Promise<MarkLateResult>;
    remove(id: string): Promise<RemoveResult>;
}

export interface MemberRepository {
    findOrCreate(discordId: string, username: string): Promise<{ member: Member; created: boolean }>;
    findByDiscordId(discordId: string): Promise<Member | null>;
    findProfile(discordId: string): Promise<MemberProfile | null>;
    isActive(discordId: string): Promise<boolean>;
    reactivate(discordId: string, username?: string): Promise<Member | null>;
    deboard(discordId: string, message: string): Promise<Member | null>;
    addStrike(discordId: string): Promise<number | null>;
    removeStrike(discordId: string): Promise<number | null>;
    listWithStrikes(): Promise<Member[]>;
    listFree(): Promise<FreeMember[]>;
    findAvailability(discordId: string): Promise<Availability | null>;
    startHiatus(discordId: string): Promise<number>;
    endHiatus(discordId: string, freshDeadline: (task: Task) => Date | null): Promise<HiatusEnd | null>;
}
