import { describe, test } from 'node:test';
import { DAY, NOW, ROLE, recording, run, seedTask, useCharacterisation } from './harness.js';

const state = useCharacterisation('info');
const command = (name, user, options = {}) => state.world.command(name, { user, options });

const collect = async (collector, interaction) => {
    for (const listener of collector.listeners('collect')) await listener(interaction);
};

describe('/history', () => {
    test('reports no matching tasks', async (t) => {
        await run(state, command('history', state.cast.va));
        t.assert.snapshot(await recording(state));
    });

    test('shows one page with every filter described', async (t) => {
        const { va, editor } = state.cast;
        await seedTask(state, va, { taskName: 'Morning skit', description: 'Short one', hasExtended: true });
        await seedTask(state, va, { taskName: 'Morning story', taskType: 'story', status: 'COMPLETED' });
        await seedTask(state, editor, { taskName: 'Morning skit' });
        await run(
            state,
            command('history', state.cast.owner, { user: va, task: 'morning', status: 'pending', role: 'va' }),
        );
        t.assert.snapshot(await recording(state));
    });

    test('shows every status icon', async (t) => {
        const { va } = state.cast;
        for (const [index, status] of ['PENDING', 'COMPLETED', 'LATE', 'EXCUSED'].entries()) {
            await seedTask(state, va, {
                taskName: `Task ${status}`,
                status,
                assignedAt: new Date(NOW - (index + 1) * DAY),
            });
        }
        await run(state, command('history', va));
        t.assert.snapshot(await recording(state));
    });

    test('matches task text literally', async (t) => {
        const { va } = state.cast;
        await seedTask(state, va, { taskName: 'a.b test' });
        await seedTask(state, va, { taskName: 'axb test' });
        await run(state, command('history', va, { task: 'a.b' }));
        t.assert.snapshot(await recording(state));
    });

    test('pages through results with buttons, only for the requester', async (t) => {
        const { va, owner, editor } = state.cast;
        for (let index = 0; index < 7; index += 1) {
            await seedTask(state, va, { taskName: `Skit ${index}`, assignedAt: new Date(NOW - (index + 1) * DAY) });
        }
        await seedTask(state, editor, {
            taskName: 'Editor job',
            roleCategoryId: ROLE.EDITOR,
            taskType: 'color_mv',
            assignedAt: new Date(NOW - 30 * DAY),
        });
        await run(state, command('history', owner));
        const firstPage = await recording(state);
        const [collector] = state.world.collectors;
        const filter = collector.options.filter;
        const allowed = { owner: filter({ user: owner }), other: filter({ user: va }) };
        await collect(collector, state.world.button('history_next', { user: owner }));
        const secondPage = state.world.take();
        await collect(collector, state.world.button('history_next', { user: owner }));
        const pastTheEnd = state.world.take();
        await collect(collector, state.world.button('history_prev', { user: owner }));
        const backToFirst = state.world.take();
        collector.stop('time');
        const ended = state.world.take();
        t.assert.snapshot({
            firstPage,
            collectorTime: collector.options.time,
            allowed,
            secondPage,
            pastTheEnd,
            backToFirst,
            ended,
        });
    });
    test('stays on the first page when Previous is pressed there', async (t) => {
        const { va } = state.cast;
        for (let index = 0; index < 6; index += 1) {
            await seedTask(state, va, { taskName: `Skit ${index}`, assignedAt: new Date(NOW - (index + 1) * DAY) });
        }
        await run(state, command('history', va));
        state.world.take();
        const [collector] = state.world.collectors;
        await collect(collector, state.world.button('history_prev', { user: va }));
        t.assert.snapshot(state.world.take());
    });

    test('a page asked for after every task was removed keeps the old embed', async (t) => {
        const { va } = state.cast;
        for (let index = 0; index < 6; index += 1) {
            await seedTask(state, va, { taskName: `Skit ${index}`, assignedAt: new Date(NOW - (index + 1) * DAY) });
        }
        await run(state, command('history', va));
        state.world.take();
        const [collector] = state.world.collectors;
        await state.Assignment.deleteMany({});
        await collect(collector, state.world.button('history_next', { user: va }));
        t.assert.snapshot(state.world.take());
    });
});

describe('/help, /ping and /uptime', () => {
    test('/help lists the commands', async (t) => {
        await run(state, command('help', state.cast.va));
        t.assert.snapshot(await recording(state));
    });

    test('/ping reports the response time', async (t) => {
        await run(state, command('ping', state.cast.va));
        t.assert.snapshot(await recording(state));
    });

    test('/uptime reports days, hours and minutes', async (t) => {
        state.world.client.uptime = 2 * DAY + 3 * 60 * 60 * 1000 + 25 * 60 * 1000 + 999;
        await run(state, command('uptime', state.cast.va));
        t.assert.snapshot(await recording(state));
    });
});

describe('access', () => {
    test('lets an owner with no member record of their own manage strikes', async (t) => {
        const { owner } = state.cast;
        await state.User.deleteOne({ discordId: owner.id });
        await run(state, state.world.command('strike', { user: owner, subcommand: 'list' }));
        t.assert.snapshot(await recording(state));
    });
});

describe('failures', () => {
    test('a command that throws tells the member something went wrong', async (t) => {
        await run(state, command('assign', state.cast.stranger, { user: state.cast.va, role: 'VA', task: 'skit' }));
        t.assert.snapshot(await recording(state));
    });

    test('a command that throws before deferring replies ephemerally', async (t) => {
        await run(state, command('bulkassign', state.cast.stranger, { role: 'VA', task: 'skit' }));
        t.assert.snapshot(await recording(state));
    });

    test('an unknown command is logged as completed and does nothing', async (t) => {
        await run(state, command('dance', state.cast.va));
        t.assert.snapshot(await recording(state));
    });
});
