import { describe, test } from 'node:test';
import { DAY, NOW, ROLE, recording, run, seedTask, setUser, useCharacterisation } from './harness.js';

const state = useCharacterisation('submission');
const command = (name, user, options = {}) => state.world.command(name, { user, options });

describe('/submit', () => {
    test('refuses submitting for someone else without being an owner', async (t) => {
        const { va, editor } = state.cast;
        await run(state, command('submit', va, { user: editor }));
        t.assert.snapshot(await recording(state));
    });

    test('refuses a member who is not onboarded', async (t) => {
        await run(state, command('submit', state.cast.newcomer));
        t.assert.snapshot(await recording(state));
    });

    test('refuses a deboarded member', async (t) => {
        const { va } = state.cast;
        await setUser(state, va, { isDeboarded: true });
        await run(state, command('submit', va));
        t.assert.snapshot(await recording(state));
    });

    test('reports a member with no tasks', async (t) => {
        await run(state, command('submit', state.cast.va));
        t.assert.snapshot(await recording(state));
    });

    test('reports a member whose tasks are all finished', async (t) => {
        const { va } = state.cast;
        await seedTask(state, va, { status: 'COMPLETED' });
        await run(state, command('submit', va));
        t.assert.snapshot(await recording(state));
    });

    test('reports a task name that does not match', async (t) => {
        const { va } = state.cast;
        await seedTask(state, va, { taskName: 'Morning skit' });
        await run(state, command('submit', va, { task: 'Evening skit' }));
        t.assert.snapshot(await recording(state));
    });

    test('sends the only pending task for review', async (t) => {
        const { va } = state.cast;
        await seedTask(state, va, { taskName: 'Morning skit', description: 'Two takes please' });
        await run(state, command('submit', va));
        t.assert.snapshot(await recording(state));
    });

    test('sends a task chosen by name, case-insensitively', async (t) => {
        const { va } = state.cast;
        await seedTask(state, va, { taskName: 'Morning skit' });
        await seedTask(state, va, { taskName: 'Evening story', taskType: 'story' });
        await run(state, command('submit', va, { task: 'EVENING STORY' }));
        t.assert.snapshot(await recording(state));
    });

    test('sends a late task with its original deadline', async (t) => {
        const { va } = state.cast;
        await seedTask(state, va, { taskName: 'Overdue skit', status: 'LATE', deadline: new Date(NOW - 2 * DAY) });
        await run(state, command('submit', va));
        t.assert.snapshot(await recording(state));
    });

    test('lets an owner submit for someone else', async (t) => {
        const { owner, va } = state.cast;
        await seedTask(state, va, { taskName: 'Morning skit' });
        await run(state, command('submit', owner, { user: va }));
        t.assert.snapshot(await recording(state));
    });

    test('offers a picker when several tasks are pending', async (t) => {
        const { va } = state.cast;
        await seedTask(state, va, { taskName: 'Morning skit' });
        await seedTask(state, va, {
            taskName: 'Late story',
            taskType: 'story',
            status: 'LATE',
            deadline: new Date(NOW - DAY),
        });
        await run(state, command('submit', va));
        t.assert.snapshot(await recording(state));
    });
});

describe('submit picker', () => {
    test('refuses someone else picking without being an owner', async (t) => {
        const { va, editor } = state.cast;
        const task = await seedTask(state, va, { taskName: 'Morning skit' });
        await run(
            state,
            state.world.stringSelect(`submit_select_${va.id}`, { user: editor, values: [task._id.toString()] }),
        );
        t.assert.snapshot(await recording(state));
    });

    test('sends each picked task for review and counts the ones that worked', async (t) => {
        const { va } = state.cast;
        const first = await seedTask(state, va, { taskName: 'Morning skit' });
        const second = await seedTask(state, va, { taskName: 'Evening story', taskType: 'story' });
        await run(
            state,
            state.world.stringSelect(`submit_select_${va.id}`, {
                user: va,
                values: [first._id.toString(), second._id.toString(), '0123456789abcdef01234567'],
            }),
        );
        t.assert.snapshot(await recording(state));
    });

    test('ignores a select menu it does not own', async (t) => {
        await run(state, state.world.stringSelect('other_select', { user: state.cast.va, values: ['x'] }));
        t.assert.snapshot(await recording(state));
    });
});

describe('/extension', () => {
    test('refuses asking for someone else without being an owner', async (t) => {
        const { va, editor } = state.cast;
        await run(state, command('extension', va, { user: editor, reason: 'busy' }));
        t.assert.snapshot(await recording(state));
    });

    test('refuses a member who is not onboarded', async (t) => {
        await run(state, command('extension', state.cast.newcomer, { reason: 'busy' }));
        t.assert.snapshot(await recording(state));
    });

    test('reports a member with no tasks', async (t) => {
        await run(state, command('extension', state.cast.va, { reason: 'busy' }));
        t.assert.snapshot(await recording(state));
    });

    test('reports a member with no pending tasks, even when one is late', async (t) => {
        const { va } = state.cast;
        await seedTask(state, va, { status: 'LATE', deadline: new Date(NOW - DAY) });
        await run(state, command('extension', va, { reason: 'busy' }));
        t.assert.snapshot(await recording(state));
    });

    test('refuses a blank reason', async (t) => {
        const { va } = state.cast;
        await seedTask(state, va);
        await run(state, command('extension', va, { reason: '   ' }));
        t.assert.snapshot(await recording(state));
    });

    test('reports a task name that does not match', async (t) => {
        const { va } = state.cast;
        await seedTask(state, va, { taskName: 'Morning skit' });
        await run(state, command('extension', va, { reason: 'busy', task: 'Nope' }));
        t.assert.snapshot(await recording(state));
    });

    test('asks which task when several are pending', async (t) => {
        const { va } = state.cast;
        await seedTask(state, va, { taskName: 'Morning skit' });
        await seedTask(state, va, { taskType: 'story' });
        await run(state, command('extension', va, { reason: 'busy' }));
        t.assert.snapshot(await recording(state));
    });

    test('refuses a task that has used both extensions', async (t) => {
        const { va } = state.cast;
        await seedTask(state, va, { hasExtended: true, extensionCount: 2 });
        await run(state, command('extension', va, { reason: 'busy' }));
        t.assert.snapshot(await recording(state));
    });

    test('reports a task whose role is missing from the config', async (t) => {
        const { va } = state.cast;
        await seedTask(state, va, { roleCategoryId: '999999999999999999', roleName: 'Retired role' });
        await run(state, command('extension', va, { reason: 'busy' }));
        t.assert.snapshot(await recording(state));
    });

    test('sends a request for the role extension length', async (t) => {
        const { va } = state.cast;
        await seedTask(state, va, { taskName: 'Morning skit', hasExtended: true, extensionCount: 1 });
        await run(state, command('extension', va, { reason: 'Exams this week', task: 'morning skit' }));
        t.assert.snapshot(await recording(state));
    });

    test('quotes the editor story window for an editor story task', async (t) => {
        const { editor } = state.cast;
        await seedTask(state, editor, { roleCategoryId: ROLE.EDITOR, taskType: 'story' });
        await run(state, command('extension', editor, { reason: 'Render queue' }));
        t.assert.snapshot(await recording(state));
    });

    test('quotes a custom extension when the task has one', async (t) => {
        const { owner, va } = state.cast;
        await seedTask(state, va, { taskType: 'custom', taskName: 'Chorus', customExtension: 4 * DAY });
        await run(state, command('extension', owner, { user: va, reason: 'Sick' }));
        t.assert.snapshot(await recording(state));
    });
});
