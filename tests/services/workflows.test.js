import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApprovalService } from '../../Services/approvalService.ts';
import { createReminderService } from '../../Services/reminderService.ts';
import { WEEK } from '../../Utils/domain/durations.ts';
import { DomainError } from '../../Utils/domain/errors.ts';
import { ConfigError } from '../../Utils/domain/extensions.ts';
import { at, RULES, fakes, task, member, refuses } from './fakes.js';

describe('approvals', () => {
    const service = (answers) => {
        const tasks = fakes(answers);
        return { calls: tasks.calls, ...createApprovalService({ tasks: tasks.port, rules: RULES }) };
    };

    test('finds the task a button points at', async () => {
        const found = task('a');
        const run = service({ findById: found });
        assert.equal(await run.find('a'), found);
        assert.deepEqual(run.calls, [['findById', 'a']]);
    });

    test('completes a submission and reports the strikes left', async () => {
        const run = service({ completeAndForgive: { task: task('a'), strikes: 1 } });
        assert.deepEqual(await run.approveSubmission(task('a')), { strikes: 1 });
        assert.deepEqual(run.calls, [['completeAndForgive', 'a']]);
    });

    test('refuses a submission that was already resolved', async () => {
        await refuses(service({ completeAndForgive: null }).approveSubmission(task('a')), 'TASK_RESOLVED');
    });

    test('extends by the role window and returns the new deadline', async () => {
        const run = service({ extend: task('a', { deadline: at(WEEK) }) });
        assert.deepEqual(await run.approveExtension(task('a')), { extensionMs: WEEK, deadline: at(WEEK) });
        assert.deepEqual(run.calls, [['extend', 'a', WEEK]]);
    });

    test('hands a role with no window to the store as not a number, which the store rejects', async () => {
        const run = service({ extend: () => Promise.reject(new Error('INVALID_EXTENSION')) });
        await assert.rejects(run.approveExtension(task('a', { roleCategoryId: 'bare' })), /INVALID_EXTENSION/);
        assert.equal(run.calls.length, 1);
        assert.ok(Number.isNaN(run.calls[0][2]));
    });

    test('lets a missing role rule through as a configuration error', async () => {
        const run = service({ extend: task('a') });
        await assert.rejects(run.approveExtension(task('a', { roleCategoryId: 'gone' })), ConfigError);
        assert.deepEqual(run.calls, []);
    });

    test('lets store refusals through', async () => {
        const run = service({ extend: () => Promise.reject(new DomainError('TASK_CHANGED')) });
        await refuses(run.approveExtension(task('a')), 'TASK_CHANGED');
    });
});

describe('reminders', () => {
    const THRESHOLDS = { SHORT_TASK: {} };
    const service = (answers, found = member()) => {
        const tasks = fakes(answers);
        const members = fakes({
            findByDiscordId: (discordId) => (typeof found === 'function' ? found(discordId) : found),
        });
        return {
            calls: tasks.calls,
            lookups: members.calls,
            ...createReminderService({ tasks: tasks.port, members: members.port, thresholds: THRESHOLDS }),
        };
    };
    const recorder = () => {
        const events = [];
        return {
            events,
            send: async (sent, type) => {
                events.push(['send', sent.id, type]);
            },
            struck: async (struck, strikes) => {
                events.push(['struck', struck.id, strikes]);
            },
            skip: (skipped, reason) => {
                events.push(['skip', skipped.id, reason]);
            },
        };
    };

    test('lists pending tasks', async () => {
        const run = service({ listPending: [task('a')] });
        assert.deepEqual(await run.pending(), [task('a')]);
    });

    test('sends each due reminder, then marks it sent, skipping members on hiatus', async () => {
        const due = [
            { task: task('a', { discordUserId: '1' }), reminderType: 'first' },
            { task: task('b', { discordUserId: '2' }), reminderType: 'final' },
            { task: task('c', { discordUserId: '3' }), reminderType: 'final' },
        ];
        const run = service({ listDueReminders: due, markReminderSent: undefined }, (discordId) =>
            discordId === '2' ? member({ isOnHiatus: true }) : discordId === '3' ? null : member(),
        );
        const handlers = recorder();
        assert.deepEqual(await run.sendReminders(handlers), { done: 2, skipped: 1 });
        assert.deepEqual(handlers.events, [
            ['send', 'a', 'first'],
            ['skip', 'b', undefined],
            ['send', 'c', 'final'],
        ]);
        assert.deepEqual(run.calls, [
            ['listDueReminders', THRESHOLDS],
            ['markReminderSent', 'a', 'first'],
            ['markReminderSent', 'c', 'final'],
        ]);
    });

    test('does not mark a reminder whose message failed', async () => {
        const run = service({
            listDueReminders: [{ task: task('a'), reminderType: 'first' }],
            markReminderSent: undefined,
        });
        await assert.rejects(run.sendReminders({ send: () => Promise.reject(new Error('down')), skip: () => {} }));
        assert.deepEqual(run.calls, [['listDueReminders', THRESHOLDS]]);
    });

    test('strikes overdue tasks and says why the others were skipped', async () => {
        const owned = { member: member() };
        const overdue = [
            task('hiatus', { discordUserId: '2', ...owned }),
            task('orphan', { member: null }),
            task('changed', owned),
            task('missing', owned),
            task('late', owned),
        ];
        const results = { changed: { outcome: 'skipped' }, missing: { outcome: 'late', strikes: null } };
        const run = service(
            { listOverdue: overdue, markLateAndStrike: (id) => results[id] ?? { outcome: 'late', strikes: 2 } },
            (discordId) => member({ isOnHiatus: discordId === '2' }),
        );
        const handlers = recorder();
        assert.deepEqual(await run.strikeOverdue(handlers), { done: 1, skipped: 4 });
        assert.deepEqual(handlers.events, [
            ['skip', 'hiatus', 'hiatus'],
            ['skip', 'orphan', 'orphaned'],
            ['skip', 'changed', 'changed'],
            ['skip', 'missing', 'noMemberRecord'],
            ['struck', 'late', 2],
        ]);
        assert.deepEqual(
            run.calls.filter(([name]) => name === 'markLateAndStrike').map(([, id]) => id),
            ['changed', 'missing', 'late'],
        );
    });

    test('strikes a member who has no record lookup as not on hiatus', async () => {
        const run = service(
            { listOverdue: [task('a', { member: member() })], markLateAndStrike: { outcome: 'late', strikes: 0 } },
            null,
        );
        const handlers = recorder();
        assert.deepEqual(await run.strikeOverdue(handlers), { done: 1, skipped: 0 });
        assert.deepEqual(handlers.events, [['struck', 'a', 0]]);
    });
});
