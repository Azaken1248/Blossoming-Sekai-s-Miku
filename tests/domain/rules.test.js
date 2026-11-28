import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    freshDeadline,
    isCompleted,
    isLate,
    isOpen,
    isPending,
    planAssignment,
    plannedDeadline,
    taskTitle,
} from '../../Utils/domain/assignments.ts';
import { DAY, HOUR, MINUTE, WEEK } from '../../Utils/domain/durations.ts';
import { DomainError } from '../../Utils/domain/errors.ts';
import { ConfigError } from '../../Utils/domain/extensions.ts';
import { TASK_STATUS } from '../../Utils/domain/model.ts';
import { dueReminder } from '../../Utils/domain/reminders.ts';
import { crewRoleNames, heldCrewRoles } from '../../Utils/domain/roles.ts';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const at = (offset) => new Date(NOW.getTime() + offset);
const RULES = {
    va1: { name: 'VA', tasks: { skit: 2 * WEEK } },
    va2: { name: 'VA', tasks: { skit: WEEK, story: 3 * WEEK } },
    ed: { name: 'Editor', tasks: { mv: 8 * WEEK, zero: 0 } },
};

describe('durations', () => {
    test('are in milliseconds', () => {
        assert.deepEqual([MINUTE, HOUR, DAY, WEEK], [60_000, 3_600_000, 86_400_000, 604_800_000]);
    });
});

describe('errors', () => {
    test('carry a code, and details when the code has them', () => {
        const missing = new DomainError('ROLE_MISSING', { roleName: 'VA' });
        assert.deepEqual(
            [missing.name, missing.message, missing.code, missing.details],
            ['DomainError', 'ROLE_MISSING', 'ROLE_MISSING', { roleName: 'VA' }],
        );
        assert.equal(new DomainError('TASK_NOT_FOUND').details, undefined);
    });

    test('a configuration error keeps its own message', () => {
        const error = new ConfigError('Role category 1 is not present');
        assert.ok(error instanceof DomainError);
        assert.deepEqual(
            [error.name, error.code, error.message],
            ['ConfigError', 'CONFIG_MISSING_ROLE', 'Role category 1 is not present'],
        );
    });
});

describe('task status', () => {
    test('is pending, late, completed or neither; open means pending or late', () => {
        const table = Object.values(TASK_STATUS).map((status) =>
            [isPending, isLate, isCompleted, isOpen].map((check) => check({ status })),
        );
        assert.deepEqual(table, [
            [true, false, false, true],
            [false, false, true, false],
            [false, true, false, true],
            [false, false, false, false],
        ]);
    });

    test('a task is titled by its name, or its type', () => {
        assert.equal(taskTitle({ taskName: 'Intro', taskType: 'skit' }), 'Intro');
        assert.equal(taskTitle({ taskName: '', taskType: 'skit' }), 'skit');
    });
});

describe('fresh deadline', () => {
    const fresh = (roleCategoryId, taskType) => freshDeadline({ roleCategoryId, taskType }, RULES, NOW);

    test('is the full duration from now', () => {
        assert.deepEqual(fresh('va1', 'skit'), at(2 * WEEK));
    });

    test('is none for an unknown role, unknown type, inherited name or zero duration', () => {
        assert.deepEqual(
            [fresh('gone', 'skit'), fresh('va1', 'custom'), fresh('va1', 'constructor'), fresh('ed', 'zero')],
            [null, null, null, null],
        );
    });
});

describe('planning an assignment', () => {
    const plan = (request) => planAssignment({ roleName: 'VA', roleIds: ['va1', 'va2'], ...request }, RULES, NOW);
    const refuses = (request, code, details) =>
        assert.throws(
            () => plan(request),
            (error) => {
                assert.ok(error instanceof DomainError);
                assert.deepEqual([error.code, error.details], [code, details]);
                return true;
            },
        );

    test('a standard task uses the first held role that has it', () => {
        assert.deepEqual(plan({ taskType: 'skit' }), {
            roleCategoryId: 'va1',
            roleName: 'VA',
            deadline: at(2 * WEEK),
            customExtension: null,
        });
        assert.equal(plan({ taskType: 'story' }).roleCategoryId, 'va2');
        assert.deepEqual(plan({ taskType: 'skit', roleIds: ['va2'] }).deadline, at(WEEK));
    });

    test('a custom task uses its own length and optional extension', () => {
        assert.deepEqual(plan({ taskType: 'custom', durationDays: 10, extensionDays: 4 }), {
            roleCategoryId: 'va1',
            roleName: 'VA',
            deadline: at(10 * DAY),
            customExtension: 4 * DAY,
        });
        assert.equal(plan({ taskType: 'custom', durationDays: 0.5 }).customExtension, null);
        assert.equal(plan({ taskType: 'custom', durationDays: 1, extensionDays: 0 }).customExtension, null);
    });

    test('a custom task needs a positive length', () => {
        for (const durationDays of [undefined, null, 0, -1, Number.NaN]) {
            refuses({ taskType: 'custom', durationDays }, 'CUSTOM_DURATION_REQUIRED', undefined);
        }
    });

    test('a standard task takes no length or extension', () => {
        refuses({ taskType: 'skit', durationDays: 1 }, 'CUSTOM_FIELDS_NOT_ALLOWED', undefined);
        refuses({ taskType: 'skit', extensionDays: 1 }, 'CUSTOM_FIELDS_NOT_ALLOWED', undefined);
    });

    test('the member must hold a role with that name', () => {
        refuses({ taskType: 'skit', roleIds: ['ed'] }, 'ROLE_MISSING', { roleName: 'VA' });
        refuses({ taskType: 'custom', durationDays: 1, roleIds: [] }, 'ROLE_MISSING', { roleName: 'VA' });
        refuses({ taskType: 'skit', roleName: 'Nope' }, 'ROLE_MISSING', { roleName: 'Nope' });
    });

    test('the role must have that task type; the valid ones come from the first role of that name', () => {
        refuses({ taskType: 'story', roleIds: ['va1'] }, 'TASK_TYPE_INVALID', {
            taskType: 'story',
            roleName: 'VA',
            validTasks: ['skit'],
        });
        refuses({ taskType: 'mv', roleIds: ['va2'] }, 'TASK_TYPE_INVALID', {
            taskType: 'mv',
            roleName: 'VA',
            validTasks: ['skit'],
        });
        refuses({ taskType: 'toString' }, 'TASK_TYPE_INVALID', {
            taskType: 'toString',
            roleName: 'VA',
            validTasks: ['skit'],
        });
    });
});

describe('reminders', () => {
    const THRESHOLDS = {
        SHORT_TASK: { duration: 7 * DAY, firstReminder: 2 * DAY, finalReminder: 12 * HOUR },
        MEDIUM_TASK: { duration: 14 * DAY, firstReminder: 4 * DAY, finalReminder: DAY },
        LONG_TASK: { firstReminder: 7 * DAY, finalReminder: 3 * DAY },
    };

    for (const [label, duration, remaining, sent, expected] of [
        ['short at its longest, at the first threshold', 7 * DAY, 2 * DAY, {}, 'first'],
        ['short, just before it', 7 * DAY, 2 * DAY + 1, {}, null],
        ['medium by one millisecond', 7 * DAY + 1, 4 * DAY, {}, 'first'],
        ['medium at its longest', 14 * DAY, 4 * DAY + 1, {}, null],
        ['long', 14 * DAY + 1, 7 * DAY, {}, 'first'],
        ['long, final', 14 * DAY + 1, 3 * DAY, { firstReminderSent: true }, 'final'],
        ['first comes before final', 7 * DAY, HOUR, {}, 'first'],
        ['final at its threshold', 7 * DAY, 12 * HOUR, { firstReminderSent: true }, 'final'],
        ['before final', 7 * DAY, 12 * HOUR + 1, { firstReminderSent: true }, null],
        ['both sent', 7 * DAY, HOUR, { firstReminderSent: true, finalReminderSent: true }, null],
    ]) {
        test(label, () => {
            const deadline = at(remaining);
            const task = { deadline, assignedAt: new Date(deadline.getTime() - duration), ...sent };
            assert.equal(dueReminder(task, THRESHOLDS, NOW)?.reminderType ?? null, expected);
        });
    }
});

describe('crew roles', () => {
    const CREW = ['va1', 'ed', 'nameless', 'unknown'];
    const rules = { ...RULES, nameless: { name: '', tasks: {} } };

    test('are the held ones, in configured order', () => {
        assert.deepEqual(heldCrewRoles(['ed', 'other', 'va1'], CREW), ['va1', 'ed']);
        assert.deepEqual(heldCrewRoles([], CREW), []);
    });

    test('are named when the rule has a name', () => {
        assert.deepEqual(crewRoleNames(['unknown', 'nameless', 'ed', 'va1'], CREW, rules), ['VA', 'Editor']);
    });
});

describe('plannedDeadline', () => {
    const rules = { 10: { name: 'VA', tasks: { skit: 1000 }, extension: 0 } };
    const now = new Date('2026-06-15T12:00:00.000Z');
    const plan = (changes) =>
        plannedDeadline({ roleCategoryId: '10', taskType: 'skit', duration: null, ...changes }, rules, now);

    test('uses the role rule unless a duration is given', () => {
        assert.deepEqual(plan({}), new Date(now.getTime() + 1000));
        assert.deepEqual(plan({ duration: 7 }), new Date(now.getTime() + 7));
        assert.deepEqual(plan({ taskType: 'custom', duration: 9 }), new Date(now.getTime() + 9));
    });

    test('refuses an unknown role, an unknown task and a custom task with no duration', () => {
        assert.throws(() => plan({ roleCategoryId: '11' }), {
            code: 'ROLE_UNKNOWN',
            details: { roleCategoryId: '11' },
        });
        assert.throws(() => plan({ roleCategoryId: 'toString' }), { code: 'ROLE_UNKNOWN' });
        assert.throws(() => plan({ taskType: 'nope', duration: 5 }), {
            code: 'TASK_TYPE_INVALID',
            details: { taskType: 'nope', roleName: 'VA', validTasks: ['skit'] },
        });
        assert.throws(() => plan({ taskType: 'custom' }), { code: 'CUSTOM_DURATION_REQUIRED' });
    });
});
