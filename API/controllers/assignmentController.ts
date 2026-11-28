import type { Request, Response } from 'express';
import config from '../../config.js';
import { recordService } from '../../Services/index.ts';
import { HOUR } from '../../Utils/domain/durations.ts';
import { handle } from './handle.ts';

const SNOWFLAKE = /^\d{17,20}$/;
const MAX_HOURS = 24 * 365;
const REQUIRED = ['discordId', 'roleCategoryId', 'taskType'] as const;

interface RoleRule {
    readonly name: string;
}

interface NewAssignmentBody {
    readonly discordId?: unknown;
    readonly roleCategoryId?: unknown;
    readonly roleName?: unknown;
    readonly taskType?: unknown;
    readonly taskName?: unknown;
    readonly description?: unknown;
    readonly deadlineHours?: unknown;
}

const rules = config.RULES as Readonly<Record<string, RoleRule | undefined>>;

const parseHours = (value: unknown): number | null => {
    const hours = Number(value);
    return Number.isFinite(hours) && hours > 0 && hours <= MAX_HOURS ? hours : null;
};

const hasCode = (error: unknown, code: string) => (error as { readonly code?: unknown } | null)?.code === code;
const isCastError = (error: unknown) => (error as { readonly name?: unknown } | null)?.name === 'CastError';

type Checked = { readonly refusal: string } | { readonly hours: number; readonly rule: RoleRule };

const check = (body: NewAssignmentBody): Checked => {
    const missing = REQUIRED.filter((field) => !body[field]);
    if (missing.length) return { refusal: `Missing required field(s): ${missing.join(', ')}` };
    if (!SNOWFLAKE.test(String(body.discordId))) {
        return { refusal: 'discordId must be a Discord snowflake (17-20 digits)' };
    }
    const hours = parseHours(body.deadlineHours);
    if (hours === null) {
        return { refusal: `deadlineHours must be a number greater than 0 and at most ${String(MAX_HOURS)}` };
    }
    const rule = rules[String(body.roleCategoryId)];
    return rule ? { hours, rule } : { refusal: `Unknown roleCategoryId: ${String(body.roleCategoryId)}` };
};

export const createAssignment = handle(
    { label: 'createAssignment', failure: 'Failed to create assignment' },
    async (req, res) => {
        const body = (req.body ?? {}) as NewAssignmentBody;
        const checked = check(body);
        if ('refusal' in checked) {
            res.status(400).json({ error: checked.refusal });
            return;
        }
        const owner = await recordService.taskOwner(String(body.discordId));
        if (!owner) {
            res.status(404).json({ error: 'User not found. Create user first.' });
            return;
        }
        if (owner.isDeboarded) {
            res.status(409).json({ error: 'User has been deboarded and cannot receive new assignments.' });
            return;
        }
        const assignment = await recordService.createTask({
            memberId: owner.memberId,
            discordUserId: owner.discordId,
            roleCategoryId: String(body.roleCategoryId),
            roleName: (body.roleName as string | undefined) || checked.rule.name,
            taskType: String(body.taskType),
            taskName: (body.taskName as string | undefined) ?? '',
            description: (body.description as string | undefined) ?? '',
            deadline: new Date(Date.now() + checked.hours * HOUR),
        });
        res.status(201).json({ success: true, data: assignment });
    },
);

const taskIdOf = (req: Request) => String(req.params['taskId']);

const refuseBadId = (error: unknown, res: Response) => {
    if (!isCastError(error)) return false;
    res.status(400).json({ error: 'Invalid assignment id' });
    return true;
};

export const completeAssignment = handle(
    { label: 'completeAssignment', failure: 'Failed to complete assignment', known: refuseBadId },
    async (req, res) => {
        const task = await recordService.complete(taskIdOf(req));
        if (!task) {
            res.status(409).json({ error: 'Assignment not found, or already completed' });
            return;
        }
        res.json({ success: true, data: task });
    },
);

const EXTENSION_REFUSALS: readonly (readonly [string, number, string])[] = [
    ['ALREADY_EXTENDED', 409, 'This assignment has already used all of its extensions'],
    ['TASK_CHANGED', 409, 'This assignment was changed by another request'],
    ['TASK_NOT_FOUND', 404, 'Assignment not found'],
];

const refuseExtension = (error: unknown, res: Response) => {
    const refusal = EXTENSION_REFUSALS.find(([code]) => hasCode(error, code));
    if (!refusal) return refuseBadId(error, res);
    res.status(refusal[1]).json({ error: refusal[2] });
    return true;
};

export const extendAssignment = handle(
    { label: 'extendAssignment', failure: 'Failed to extend assignment', known: refuseExtension },
    async (req, res) => {
        const hours = parseHours((req.body as { readonly extensionHours?: unknown } | undefined)?.extensionHours);
        if (hours === null) {
            res.status(400).json({
                error: `extensionHours must be a number greater than 0 and at most ${String(MAX_HOURS)}`,
            });
            return;
        }
        res.json({ success: true, data: await recordService.extend(taskIdOf(req), hours * HOUR) });
    },
);

export const getPendingTask = handle(
    { label: 'getPendingTask', failure: 'Failed to fetch pending task' },
    async (req, res) => {
        const task = await recordService.pending(String(req.params['discordUserId']));
        if (!task) {
            res.status(404).json({ error: 'No pending task found' });
            return;
        }
        res.json({ success: true, data: task });
    },
);

export const getOverdueTasks = handle(
    { label: 'getOverdueTasks', failure: 'Failed to fetch overdue tasks' },
    async (_req, res) => {
        const tasks = await recordService.overdue();
        res.json({ success: true, count: tasks.length, data: tasks });
    },
);
