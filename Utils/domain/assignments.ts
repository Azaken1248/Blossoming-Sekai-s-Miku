import { DAY } from './durations.ts';
import { DomainError } from './errors.ts';
import { CUSTOM_TASK_TYPE, type RoleRule, type RoleRules, TASK_STATUS, type Task } from './model.ts';

type WithStatus = Pick<Task, 'status'>;

export interface AssignmentRequest {
    readonly taskType: string;
    readonly roleName: string;
    readonly roleIds: readonly string[];
    readonly durationDays?: number | null;
    readonly extensionDays?: number | null;
}

export interface AssignmentPlan {
    readonly roleCategoryId: string;
    readonly roleName: string;
    readonly deadline: Date;
    readonly customExtension: number | null;
}

export const isPending = ({ status }: WithStatus): boolean => status === TASK_STATUS.Pending;
export const isLate = ({ status }: WithStatus): boolean => status === TASK_STATUS.Late;
export const isCompleted = ({ status }: WithStatus): boolean => status === TASK_STATUS.Completed;
export const isOpen = (task: WithStatus): boolean => isPending(task) || isLate(task);

export const taskTitle = ({ taskName, taskType }: Pick<Task, 'taskName' | 'taskType'>): string => taskName || taskType;

const durationOf = (rule: RoleRule, taskType: string): number | undefined =>
    Object.hasOwn(rule.tasks, taskType) ? rule.tasks[taskType] : undefined;

const after = (now: Date, duration: number): Date => new Date(now.getTime() + duration);

export const freshDeadline = (
    { roleCategoryId, taskType }: Pick<Task, 'roleCategoryId' | 'taskType'>,
    rules: RoleRules,
    now: Date,
): Date | null => {
    const rule = rules[roleCategoryId];
    const duration = rule && durationOf(rule, taskType);
    return duration ? after(now, duration) : null;
};

const rulesNamed = (rules: RoleRules, roleName: string) =>
    Object.entries(rules).filter(([, rule]) => rule.name === roleName);

export const planAssignment = (
    { taskType, roleName, roleIds, durationDays, extensionDays }: AssignmentRequest,
    rules: RoleRules,
    now: Date,
): AssignmentPlan => {
    const isCustom = taskType === CUSTOM_TASK_TYPE;
    const customDuration = (durationDays ?? 0) * DAY;
    if (isCustom && !(customDuration > 0)) throw new DomainError('CUSTOM_DURATION_REQUIRED');
    if (!isCustom && (durationDays || extensionDays)) throw new DomainError('CUSTOM_FIELDS_NOT_ALLOWED');

    const named = rulesNamed(rules, roleName);
    const held = named.filter(([roleId]) => roleIds.includes(roleId));
    const [first] = named;
    if (!first || held.length === 0) throw new DomainError('ROLE_MISSING', { roleName });

    for (const [roleCategoryId, rule] of held) {
        const duration = isCustom ? customDuration : durationOf(rule, taskType);
        if (duration) {
            return {
                roleCategoryId,
                roleName: rule.name,
                deadline: after(now, duration),
                customExtension: isCustom && extensionDays ? extensionDays * DAY : null,
            };
        }
    }
    const validTasks = Object.keys(first[1].tasks);
    throw new DomainError('TASK_TYPE_INVALID', { taskType, roleName, validTasks });
};
