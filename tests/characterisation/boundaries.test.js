import { describe, test } from 'node:test';
import config from '../../config.js';
import { DAY, NOW, ROLE, recording, run, seedTask, setUser, useCharacterisation } from './harness.js';
import { HOUR, withConfig, boundaryActions } from './boundaryHelpers.js';

const state = useCharacterisation('boundaries');
const { command, click, startUp } = boundaryActions(state);

describe('tasks without a name', () => {
    test('/submit sends an unnamed task for review under its type', async (t) => {
        await seedTask(state, state.cast.va);
        await run(state, command('submit', state.cast.va));
        t.assert.snapshot(await recording(state));
    });

    test('the submit picker labels unnamed tasks by type', async (t) => {
        const { va } = state.cast;
        await seedTask(state, va);
        await seedTask(state, va, { taskType: 'story' });
        await run(state, command('submit', va));
        t.assert.snapshot(await recording(state));
    });

    test('/profile lists unnamed active tasks and fewer than six without a "more" line', async (t) => {
        const { va } = state.cast;
        await seedTask(state, va);
        await seedTask(state, va, { taskType: 'story' });
        await run(state, command('profile', va));
        t.assert.snapshot(await recording(state));
    });

    test('/profile of a deboarded member lists unnamed completed work by type', async (t) => {
        const { va } = state.cast;
        await seedTask(state, va, { status: 'COMPLETED' });
        await setUser(state, va, { isDeboarded: true, deboarded_at: new Date(NOW - DAY) });
        await run(state, command('profile', va));
        t.assert.snapshot(await recording(state));
    });

    test('/tasks shows N/A for a legacy task with no role name', async (t) => {
        const task = await seedTask(state, state.cast.va, { taskName: 'Roleless' });
        await state.Assignment.collection.updateOne({ _id: task._id }, { $unset: { roleName: '' } });
        await run(state, command('tasks', state.cast.va));
        t.assert.snapshot(await recording(state));
    });

    test('/history shows unnamed tasks and "Unknown" for a member whose record is gone', async (t) => {
        const { va, editor } = state.cast;
        await seedTask(state, va);
        await seedTask(state, editor, { taskName: 'Orphaned', assignedAt: new Date(NOW - 4 * DAY) });
        await state.User.deleteOne({ discordId: editor.id });
        await run(state, command('history', state.cast.owner));
        t.assert.snapshot(await recording(state));
    });

    test('/endhiatus restores unnamed standard tasks and reports only restored ones', async (t) => {
        const { va } = state.cast;
        await setUser(state, va, { isOnHiatus: true });
        await seedTask(state, va, { deadline: new Date('2099-12-31') });
        await run(state, command('endhiatus', va));
        t.assert.snapshot(await recording(state));
    });

    test('/endhiatus names an unnamed custom task by type when leaving it paused', async (t) => {
        const { va } = state.cast;
        await setUser(state, va, { isOnHiatus: true });
        await seedTask(state, va, { taskType: 'custom', deadline: new Date('2099-12-31') });
        await run(state, command('endhiatus', va));
        t.assert.snapshot(await recording(state));
    });

    test('/checkfree for one member shows an unnamed active task', async (t) => {
        await seedTask(state, state.cast.va);
        await run(state, command('checkfree', state.cast.owner, { user: state.cast.va }));
        t.assert.snapshot(await recording(state));
    });

    test('/checkfree for one member shows an unnamed last task', async (t) => {
        await seedTask(state, state.cast.va, { status: 'COMPLETED', completedAt: new Date(NOW - DAY) });
        await run(state, command('checkfree', state.cast.owner, { user: state.cast.va }));
        t.assert.snapshot(await recording(state));
    });

    test('/checkfree lists unnamed last tasks for active and hiatus members', async (t) => {
        const { va, quiet } = state.cast;
        await seedTask(state, va, { status: 'COMPLETED', completedAt: new Date(NOW - DAY) });
        await setUser(state, quiet, { isOnHiatus: true });
        await seedTask(state, quiet, {
            roleCategoryId: ROLE.SVA,
            taskType: 'short_cover',
            status: 'COMPLETED',
            completedAt: new Date(NOW - 2 * DAY),
        });
        await run(state, command('checkfree', state.cast.manager));
        t.assert.snapshot(await recording(state));
    });

    test('/bulkassign without a task name leaves the name out of the DM', async (t) => {
        const { owner, va } = state.cast;
        await run(state, command('bulkassign', owner, { role: 'VA', task: 'skit' }));
        state.world.take();
        await run(state, state.world.userSelect(`bulkassign_select_${NOW}500`, { user: owner, users: [va] }));
        t.assert.snapshot(await recording(state));
    });

    test('approving an unnamed submission names it by type', async (t) => {
        const task = await seedTask(state, state.cast.va, { submissionChannelId: '700000000000000001' });
        await run(state, click(`submit_approve_${task._id}`, state.cast.owner));
        t.assert.snapshot(await recording(state));
    });

    test('denying an unnamed submission names it by type', async (t) => {
        const task = await seedTask(state, state.cast.va, { submissionChannelId: '700000000000000001' });
        await run(state, click(`submit_deny_${task._id}`, state.cast.owner));
        t.assert.snapshot(await recording(state));
    });

    test('approving an extension for an unnamed task names it by type', async (t) => {
        const task = await seedTask(state, state.cast.va, { submissionChannelId: '700000000000000001' });
        await run(state, click(`extension_approve_${task._id}`, state.cast.manager));
        t.assert.snapshot(await recording(state));
    });

    test('denying an extension for an unnamed task names it by type', async (t) => {
        const task = await seedTask(state, state.cast.va, { submissionChannelId: '700000000000000001' });
        await run(state, click(`extension_deny_${task._id}`, state.cast.manager));
        t.assert.snapshot(await recording(state));
    });

    test('the scheduler names unnamed tasks by type in reminders and overdue notices', async (t) => {
        const { va, editor } = state.cast;
        await seedTask(state, va, { assignedAt: new Date(NOW - 6 * DAY), deadline: new Date(NOW + 10 * HOUR) });
        await seedTask(state, editor, { deadline: new Date(NOW - HOUR) });
        await startUp();
        t.assert.snapshot(await recording(state));
    });
});

describe('limits and options', () => {
    test('/assign of a custom task without extension_days uses the role extension', async (t) => {
        const { owner, va } = state.cast;
        await run(
            state,
            command('assign', owner, { user: va, role: 'VA', task: 'custom', name: 'Jingle', duration_days: 5 }),
        );
        t.assert.snapshot(await recording(state));
    });

    test('/extension without a reason option is refused as blank', async (t) => {
        await seedTask(state, state.cast.va);
        await run(state, command('extension', state.cast.va));
        t.assert.snapshot(await recording(state));
    });

    test('/extension quotes the editor MV window for an MV task', async (t) => {
        const { editor } = state.cast;
        await seedTask(state, editor, { roleCategoryId: ROLE.EDITOR, taskType: 'color_mv' });
        await run(state, command('extension', editor, { reason: 'Render queue' }));
        t.assert.snapshot(await recording(state));
    });

    test('/extension reports a role with no window for the task type', async (t) => {
        const { editor } = state.cast;
        const rule = config.RULES[ROLE.EDITOR];
        withConfig(t, () => {
            const saved = rule.extension_mv;
            delete rule.extension_mv;
            return () => {
                rule.extension_mv = saved;
            };
        });
        await seedTask(state, editor, { roleCategoryId: ROLE.EDITOR, taskType: 'color_mv' });
        await run(state, command('extension', editor, { reason: 'Render queue' }));
        t.assert.snapshot(await recording(state));
    });

    for (const [label, size, onHiatus] of [
        ['keeps an active list of exactly 1024 characters in one field', 1024, false],
        ['splits an active list of 1025 characters', 1025, false],
        ['keeps a hiatus list of exactly 1024 characters in one field', 1024, true],
        ['splits a hiatus list of 1025 characters', 1025, true],
    ]) {
        test(`/checkfree ${label}`, async (t) => {
            await state.User.deleteMany({});
            const plainIds = Array.from(
                { length: 23 },
                (_, index) => `3000000000000000${String(index).padStart(2, '0')}`,
            );
            const line = (id, info) => `• <@${id}> - ${info}\n`;
            for (const discordId of plainIds) {
                await state.User.create({ discordId, username: discordId, isOnHiatus: onHiatus });
            }
            const paddedId = '300000000000000099';
            const used = plainIds.reduce((sum, id) => sum + line(id, 'No prior tasks').length, 0);
            const nameLength = size - used - line(paddedId, 'Last: **').length;
            const padded = await state.User.create({ discordId: paddedId, username: 'padded', isOnHiatus: onHiatus });
            const lastTask = await state.Assignment.create({
                userId: padded._id,
                discordUserId: paddedId,
                roleCategoryId: ROLE.VA,
                roleName: 'VA',
                taskType: 'skit',
                taskName: 'x'.repeat(nameLength),
                status: 'COMPLETED',
                deadline: new Date(NOW - DAY),
                completedAt: new Date(NOW - DAY),
            });
            await state.User.updateOne({ _id: padded._id }, { $push: { assignments: lastTask._id } });
            await run(state, command('checkfree', state.cast.manager));
            const recorded = await recording(state);
            const fields = recorded.discord.at(-1).payload.embeds[0].fields ?? [];
            t.assert.snapshot({ fieldLengths: fields.map(({ name, value }) => [name, value.length]), ...recorded });
        });
    }

    test('/checkfree splits both the active and the hiatus lists past 1024 characters', async (t) => {
        for (let index = 0; index < 60; index += 1) {
            const discordId = `2000000000000000${String(index).padStart(2, '0')}`;
            await state.User.create({ discordId, username: `bulk.${index}`, isOnHiatus: index % 2 === 0 });
        }
        await run(state, command('checkfree', state.cast.manager));
        t.assert.snapshot(await recording(state));
    });

    for (const [label, latency] of [
        ['excellent', 199],
        ['good', 200],
        ['good', 399],
        ['slow', 400],
    ]) {
        test(`/ping rates ${latency} ms as ${label}`, async (t) => {
            const interaction = command('ping', state.cast.va);
            const editReply = interaction.editReply;
            interaction.editReply = async (payload) => ({
                ...(await editReply(payload)),
                createdTimestamp: NOW + latency,
            });
            await run(state, interaction);
            t.assert.snapshot(await recording(state));
        });
    }

    test('/bulkassign sessions expire after fifteen minutes', async (t) => {
        const { owner, va } = state.cast;
        await run(state, command('bulkassign', owner, { role: 'VA', task: 'skit' }));
        const expiry = state.timers.find(({ ms }) => ms === 15 * 60 * 1000);
        expiry.callback();
        state.world.take();
        await run(state, state.world.userSelect(`bulkassign_select_${NOW}500`, { user: owner, users: [va] }));
        t.assert.snapshot(await recording(state));
    });

    test('/profile treats a legacy record with no assignments field as having none', async (t) => {
        const { va, editor } = state.cast;
        await state.User.collection.updateMany(
            { discordId: { $in: [va.id, editor.id] } },
            { $unset: { assignments: '' } },
        );
        await setUser(state, editor, { isDeboarded: true, deboarded_at: new Date(NOW - DAY) });
        await run(state, command('profile', va));
        await run(state, command('profile', editor));
        t.assert.snapshot(await recording(state));
    });

    test('the scheduler sends no reminder for a task due this instant', async (t) => {
        await seedTask(state, state.cast.va, {
            taskName: 'Due now',
            assignedAt: new Date(NOW - 13 * DAY),
            deadline: new Date(NOW),
        });
        await startUp();
        t.assert.snapshot(await recording(state));
    });
});
