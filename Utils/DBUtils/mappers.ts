import type { StoredTask } from '../../DB/Schemas/assignment.ts';
import { DEFAULT_DEBOARDED_MESSAGE, type StoredMember } from '../../DB/Schemas/user.ts';
import type { Member, Task } from '../domain/model.ts';
import type { TaskWithMember } from './types.ts';

export type Populated<Document, Key extends keyof Document, Value> = Omit<Document, Key> & Record<Key, Value>;

const taskFields = (stored: Omit<StoredTask, 'userId'>): Omit<Task, 'memberId'> => ({
    id: stored._id.toString(),
    discordUserId: stored.discordUserId,
    roleCategoryId: stored.roleCategoryId,
    roleName: stored.roleName ?? '',
    taskType: stored.taskType,
    taskName: stored.taskName ?? '',
    description: stored.description ?? '',
    assignedAt: stored.assignedAt ?? stored._id.getTimestamp(),
    deadline: stored.deadline,
    hasExtended: stored.hasExtended ?? false,
    extensionCount: stored.extensionCount ?? 0,
    customExtension: stored.customExtension ?? null,
    submissionChannelId: stored.submissionChannelId ?? null,
    firstReminderSent: stored.firstReminderSent ?? false,
    finalReminderSent: stored.finalReminderSent ?? false,
    status: stored.status ?? 'PENDING',
    completedAt: stored.completedAt ?? null,
});

export const toTask = (stored: StoredTask): Task => ({
    ...taskFields(stored),
    memberId: stored.userId.toString(),
});

export const toMember = (stored: Omit<StoredMember, 'assignments'>): Member => ({
    id: stored._id.toString(),
    discordId: stored.discordId,
    username: stored.username ?? null,
    strikes: stored.strikes ?? 0,
    isOnHiatus: stored.isOnHiatus ?? false,
    isDeboarded: stored.isDeboarded ?? false,
    deboardedAt: stored.deboarded_at ?? null,
    deboardedMessage: stored.deboarded_statusMessage ?? DEFAULT_DEBOARDED_MESSAGE,
    roles: stored.roles ?? [],
    joinedAt: stored.joinedAt ?? stored._id.getTimestamp(),
});

export const toTaskWithMember = (stored: Populated<StoredTask, 'userId', StoredMember | null>): TaskWithMember => {
    const member = stored.userId === null ? null : toMember(stored.userId);
    return { ...taskFields(stored), memberId: member?.id ?? '', member };
};
