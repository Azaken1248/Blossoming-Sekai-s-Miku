import { describe, test } from 'node:test';
import config from '../../config.js';
import {
    DAY,
    HIATUS_CHANNEL_ID,
    NOW,
    ROLE,
    recording,
    run,
    seedTask,
    setUser,
    useCharacterisation,
} from './harness.js';

const state = useCharacterisation('buttons');
const REVIEW_EMBED = { title: 'Review me', description: 'Original request' };
const click = (customId, user, embeds = [REVIEW_EMBED]) => state.world.button(customId, { user, message: { embeds } });

const pendingTask = (user, overrides = {}) =>
    seedTask(state, user, { taskName: 'Review skit', submissionChannelId: '700000000000000001', ...overrides });

describe('buttons this handler does not own', () => {
    test('are ignored', async (t) => {
        await run(state, click('history_next', state.cast.va));
        t.assert.snapshot(await recording(state));
    });
});

describe('submission buttons', () => {
    test('report a task that no longer exists', async (t) => {
        await run(state, click('submit_approve_0123456789abcdef01234567', state.cast.owner));
        t.assert.snapshot(await recording(state));
    });

    test('report a button with no task id as a task that no longer exists', async (t) => {
        await run(state, click('submit_approve', state.cast.owner));
        t.assert.snapshot(await recording(state));
    });

    test('ignore a decision that is neither approve nor deny', async (t) => {
        const task = await pendingTask(state.cast.va);
        await run(state, click(`submit_maybe_${task._id}`, state.cast.owner));
        t.assert.snapshot(await recording(state));
    });

    test('refuse approval by a non-owner', async (t) => {
        const task = await pendingTask(state.cast.va);
        await run(state, click(`submit_approve_${task._id}`, state.cast.manager));
        t.assert.snapshot(await recording(state));
    });

    test('approve, remove a strike and notify the submission and log channels', async (t) => {
        const { owner, va } = state.cast;
        await setUser(state, va, { strikes: 2 });
        const task = await pendingTask(va);
        await run(state, click(`submit_approve_${task._id}`, owner));
        t.assert.snapshot(await recording(state));
    });

    test('approve a late task without a submission channel', async (t) => {
        const { owner, va } = state.cast;
        const task = await pendingTask(va, {
            status: 'LATE',
            submissionChannelId: null,
            deadline: new Date(NOW - DAY),
        });
        await run(state, click(`submit_approve_${task._id}`, owner));
        t.assert.snapshot(await recording(state));
    });

    test('ignore a second approval of the same task', async (t) => {
        const { owner, va } = state.cast;
        await setUser(state, va, { strikes: 2 });
        const task = await pendingTask(va);
        await run(state, click(`submit_approve_${task._id}`, owner));
        state.world.take();
        await run(state, click(`submit_approve_${task._id}`, owner));
        t.assert.snapshot(await recording(state));
    });

    test('refuse denial by a non-owner', async (t) => {
        const task = await pendingTask(state.cast.va);
        await run(state, click(`submit_deny_${task._id}`, state.cast.manager));
        t.assert.snapshot(await recording(state));
    });

    test('deny and tell the member in the submission channel', async (t) => {
        const task = await pendingTask(state.cast.va);
        await run(state, click(`submit_deny_${task._id}`, state.cast.owner));
        t.assert.snapshot(await recording(state));
    });
});

describe('extension buttons', () => {
    test('refuse approval by someone who is not a manager or owner', async (t) => {
        const task = await pendingTask(state.cast.va);
        await run(state, click(`extension_approve_${task._id}`, state.cast.editor));
        t.assert.snapshot(await recording(state));
    });

    test('approve, move the deadline and notify both channels', async (t) => {
        const task = await pendingTask(state.cast.va);
        await run(state, click(`extension_approve_${task._id}`, state.cast.manager));
        t.assert.snapshot(await recording(state));
    });

    test('approve a second extension using the editor story window', async (t) => {
        const { editor, owner } = state.cast;
        const task = await pendingTask(editor, {
            roleCategoryId: ROLE.EDITOR,
            taskType: 'story',
            hasExtended: true,
            extensionCount: 1,
            submissionChannelId: null,
        });
        await run(state, click(`extension_approve_${task._id}`, owner));
        t.assert.snapshot(await recording(state));
    });

    test('refuse a third extension', async (t) => {
        const task = await pendingTask(state.cast.va, { hasExtended: true, extensionCount: 2 });
        await run(state, click(`extension_approve_${task._id}`, state.cast.manager));
        t.assert.snapshot(await recording(state));
    });

    test('report a task whose role is missing from the config', async (t) => {
        const task = await pendingTask(state.cast.va, { roleCategoryId: '999999999999999999', roleName: 'Retired' });
        await run(state, click(`extension_approve_${task._id}`, state.cast.manager));
        t.assert.snapshot(await recording(state));
    });

    test('refuse denial by someone who is not a manager or owner', async (t) => {
        const task = await pendingTask(state.cast.va);
        await run(state, click(`extension_deny_${task._id}`, state.cast.va));
        t.assert.snapshot(await recording(state));
    });

    test('deny and tell the member', async (t) => {
        const task = await pendingTask(state.cast.va);
        await run(state, click(`extension_deny_${task._id}`, state.cast.manager));
        t.assert.snapshot(await recording(state));
    });
});

describe('hiatus buttons', () => {
    const hiatusEmbed = { title: 'Hiatus Request', footer: { text: `Channel: ${HIATUS_CHANNEL_ID}` } };

    test('refuse someone who is not a manager or owner', async (t) => {
        await run(state, click(`hiatus_approve_${state.cast.va.id}`, state.cast.editor, [hiatusEmbed]));
        t.assert.snapshot(await recording(state));
    });

    test('approve, pause pending tasks and notify the request channel', async (t) => {
        const { va, manager } = state.cast;
        await seedTask(state, va, { taskName: 'Pending skit' });
        await seedTask(state, va, { taskName: 'Done skit', status: 'COMPLETED' });
        await run(state, click(`hiatus_approve_${va.id}`, manager, [hiatusEmbed]));
        t.assert.snapshot(await recording(state));
    });

    test('approve a request whose embed has no channel footer', async (t) => {
        await run(state, click(`hiatus_approve_${state.cast.va.id}`, state.cast.owner, [{ title: 'Hiatus Request' }]));
        t.assert.snapshot(await recording(state));
    });

    test('deny and tell the member', async (t) => {
        await run(state, click(`hiatus_deny_${state.cast.va.id}`, state.cast.owner, [hiatusEmbed]));
        t.assert.snapshot(await recording(state));
    });

    test('deny without a channel footer', async (t) => {
        await run(state, click(`hiatus_deny_${state.cast.va.id}`, state.cast.owner, []));
        t.assert.snapshot(await recording(state));
    });
});

describe('button failures', () => {
    test('a button pressed by someone who left the server reports an error', async (t) => {
        const task = await pendingTask(state.cast.va);
        await run(state, click(`submit_approve_${task._id}`, state.cast.stranger));
        t.assert.snapshot(await recording(state));
    });

    test('approval with the log channel missing still completes', async (t) => {
        state.world.channels.delete(config.LOG_CHANNEL_ID);
        const task = await pendingTask(state.cast.va, { submissionChannelId: '799999999999999999' });
        await run(state, click(`submit_approve_${task._id}`, state.cast.owner));
        t.assert.snapshot(await recording(state));
    });
});
