import { describe, test } from 'node:test';
import { DAY, NOW, ROLE, recording, run, seedTask, useCharacterisation } from './harness.js';

const state = useCharacterisation('assignment');
const command = (name, user, options = {}, subcommand = null) =>
    state.world.command(name, { user, options, subcommand });

describe('/assign', () => {
    test('refuses a member who is not an owner', async (t) => {
        const { va, newcomer } = state.cast;
        await run(state, command('assign', va, { user: newcomer, role: 'VA', task: 'skit' }));
        t.assert.snapshot(await recording(state));
    });

    test('refuses a target who is not in the server', async (t) => {
        const { owner, stranger } = state.cast;
        await run(state, command('assign', owner, { user: stranger, role: 'VA', task: 'skit' }));
        t.assert.snapshot(await recording(state));
    });

    test('refuses a custom task without duration_days', async (t) => {
        const { owner, va } = state.cast;
        await run(state, command('assign', owner, { user: va, role: 'VA', task: 'custom' }));
        t.assert.snapshot(await recording(state));
    });

    test('refuses a custom task for a role the target lacks', async (t) => {
        const { owner, va } = state.cast;
        await run(state, command('assign', owner, { user: va, role: 'composer', task: 'custom', duration_days: 5 }));
        t.assert.snapshot(await recording(state));
    });

    test('assigns a custom task with its own extension length', async (t) => {
        const { owner, va } = state.cast;
        await run(
            state,
            command('assign', owner, {
                user: va,
                role: 'VA',
                task: 'custom',
                name: 'Theme song chorus',
                description: 'Record the chorus twice',
                duration_days: 10,
                extension_days: 4,
            }),
        );
        t.assert.snapshot(await recording(state));
    });

    test('refuses duration_days on a standard task', async (t) => {
        const { owner, va } = state.cast;
        await run(state, command('assign', owner, { user: va, role: 'VA', task: 'skit', duration_days: 3 }));
        t.assert.snapshot(await recording(state));
    });

    test('refuses a standard task for a role the target lacks', async (t) => {
        const { owner, va } = state.cast;
        await run(state, command('assign', owner, { user: va, role: 'SVA', task: 'short_cover' }));
        t.assert.snapshot(await recording(state));
    });

    test('refuses a task type the role does not have', async (t) => {
        const { owner, va } = state.cast;
        await run(state, command('assign', owner, { user: va, role: 'VA', task: 'full_cover' }));
        t.assert.snapshot(await recording(state));
    });

    test('assigns a standard task and creates the member record when missing', async (t) => {
        const { owner, newcomer } = state.cast;
        await run(state, command('assign', owner, { user: newcomer, role: 'VA', task: 'story', name: 'Rainy day' }));
        t.assert.snapshot(await recording(state));
    });
});

describe('/bulkassign', () => {
    test('refuses a member who is not an owner', async (t) => {
        await run(state, command('bulkassign', state.cast.manager, { role: 'VA', task: 'skit' }));
        t.assert.snapshot(await recording(state));
    });

    test('offers a user picker, then assigns to each selected member', async (t) => {
        const { owner, va, editor, manager, quiet } = state.cast;
        await run(
            state,
            command('bulkassign', owner, {
                role: 'VA',
                task: 'skit',
                name: 'Group skit',
                description: 'Lines in the doc',
            }),
        );
        const picker = await recording(state);
        const operationId = `${NOW}500`;
        await run(
            state,
            state.world.userSelect(`bulkassign_select_${operationId}`, {
                user: owner,
                users: [va, editor, manager, quiet],
            }),
        );
        t.assert.snapshot({ picker, selection: await recording(state) });
    });

    test('refuses a selection from someone other than the owner who started it', async (t) => {
        const { owner, manager, va } = state.cast;
        await run(state, command('bulkassign', owner, { role: 'VA', task: 'skit' }));
        state.world.take();
        await run(state, state.world.userSelect(`bulkassign_select_${NOW}500`, { user: manager, users: [va] }));
        t.assert.snapshot(await recording(state));
    });

    test('reports an expired session', async (t) => {
        const { owner, va } = state.cast;
        await run(state, state.world.userSelect('bulkassign_select_123', { user: owner, users: [va] }));
        t.assert.snapshot(await recording(state));
    });

    test('reports an empty selection', async (t) => {
        const { owner } = state.cast;
        await run(state, command('bulkassign', owner, { role: 'VA', task: 'skit' }));
        state.world.take();
        await run(state, state.world.userSelect(`bulkassign_select_${NOW}500`, { user: owner, users: [] }));
        t.assert.snapshot(await recording(state));
    });

    test('ignores a user picker it does not own', async (t) => {
        await run(state, state.world.userSelect('other_select_1', { user: state.cast.owner, users: [] }));
        t.assert.snapshot(await recording(state));
    });
});

describe('/removetask', () => {
    test('refuses a member who is not a manager or owner', async (t) => {
        const { va } = state.cast;
        await seedTask(state, va, { taskName: 'Keep me' });
        await run(state, command('removetask', va, { user: va, task: 'Keep me' }));
        t.assert.snapshot(await recording(state));
    });

    test('reports a task that does not exist', async (t) => {
        await run(state, command('removetask', state.cast.manager, { user: state.cast.va, task: 'Nothing' }));
        t.assert.snapshot(await recording(state));
    });

    test('refuses to remove a completed task', async (t) => {
        const { manager, va } = state.cast;
        await seedTask(state, va, { taskName: 'Done one', status: 'COMPLETED' });
        await run(state, command('removetask', manager, { user: va, task: 'Done one' }));
        t.assert.snapshot(await recording(state));
    });

    test('removes a pending task by type', async (t) => {
        const { owner, va } = state.cast;
        await seedTask(state, va, { taskType: 'story', deadline: new Date(NOW + 5 * DAY) });
        await run(state, command('removetask', owner, { user: va, task: 'story' }));
        t.assert.snapshot(await recording(state));
    });
});

describe('/tasks', () => {
    test('reports a member with no record', async (t) => {
        await run(state, command('tasks', state.cast.newcomer));
        t.assert.snapshot(await recording(state));
    });

    test('reports a deboarded member', async (t) => {
        const { va, owner } = state.cast;
        await state.User.updateOne({ discordId: va.id }, { isDeboarded: true });
        await run(state, command('tasks', owner, { user: va }));
        t.assert.snapshot(await recording(state));
    });

    test('reports a member with no tasks', async (t) => {
        await run(state, command('tasks', state.cast.va));
        t.assert.snapshot(await recording(state));
    });

    test('reports a member with only finished tasks', async (t) => {
        const { va } = state.cast;
        await seedTask(state, va, { status: 'COMPLETED' });
        await run(state, command('tasks', va));
        t.assert.snapshot(await recording(state));
    });

    test('lists pending and late tasks with their details', async (t) => {
        const { editor } = state.cast;
        await seedTask(state, editor, {
            taskName: 'Opening MV',
            taskType: 'color_mv',
            roleCategoryId: ROLE.EDITOR,
            description: 'Use the new palette',
            hasExtended: true,
        });
        await seedTask(state, editor, { taskType: 'skit', status: 'LATE', deadline: new Date(NOW - 2 * DAY) });
        await run(state, command('tasks', editor));
        t.assert.snapshot(await recording(state));
    });

    test('shows N/A deadlines for a member on hiatus', async (t) => {
        const { va } = state.cast;
        await state.User.updateOne({ discordId: va.id }, { isOnHiatus: true });
        await seedTask(state, va, { taskName: 'Paused one', deadline: new Date('2099-12-31') });
        await run(state, command('tasks', va));
        t.assert.snapshot(await recording(state));
    });
});
