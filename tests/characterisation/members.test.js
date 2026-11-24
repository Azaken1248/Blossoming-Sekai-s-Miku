import { describe, test } from 'node:test';
import config from '../../config.js';
import { DAY, NOW, ROLE, recording, run, seedTask, setUser, useCharacterisation } from './harness.js';

const state = useCharacterisation('members');
const command = (name, user, options = {}, subcommand = null) =>
    state.world.command(name, { user, options, subcommand });

describe('/profile', () => {
    test('shows Miku her own profile', async (t) => {
        await run(state, command('profile', state.cast.va, { user: state.cast.miku }));
        t.assert.snapshot(await recording(state));
    });

    test('reports a member with no record', async (t) => {
        await run(state, command('profile', state.cast.newcomer));
        t.assert.snapshot(await recording(state));
    });

    test('shows an archived profile for a deboarded member', async (t) => {
        const { va } = state.cast;
        await seedTask(state, va, { taskName: 'Old skit', status: 'COMPLETED' });
        await setUser(state, va, {
            isDeboarded: true,
            deboarded_at: new Date(NOW - 10 * DAY),
            deboarded_statusMessage: 'Moved on',
        });
        await run(state, command('profile', state.cast.owner, { user: va }));
        t.assert.snapshot(await recording(state));
    });

    test('shows a deboarded member with nothing completed', async (t) => {
        const { va } = state.cast;
        await setUser(state, va, { isDeboarded: true, deboarded_at: new Date(NOW - DAY) });
        await run(state, command('profile', va));
        t.assert.snapshot(await recording(state));
    });

    test('shows a busy member with crew roles, active, completed and late tasks', async (t) => {
        const { editor } = state.cast;
        for (let index = 0; index < 6; index += 1) {
            await seedTask(state, editor, { taskName: `Pending ${index}`, hasExtended: index === 0 });
        }
        for (let index = 0; index < 4; index += 1) {
            await seedTask(state, editor, { taskName: `Done ${index}`, status: 'COMPLETED' });
        }
        await seedTask(state, editor, { taskName: 'Missed', status: 'LATE', deadline: new Date(NOW - DAY) });
        await setUser(state, editor, { strikes: 1 });
        await run(state, command('profile', editor));
        t.assert.snapshot(await recording(state));
    });

    for (const [label, fields] of [
        ['on hiatus', { isOnHiatus: true }],
        ['at the strike limit', { strikes: 3 }],
        ['on two strikes', { strikes: 2 }],
    ]) {
        test(`colours the profile of a member ${label}`, async (t) => {
            const { va } = state.cast;
            await setUser(state, va, fields);
            await run(state, command('profile', va));
            t.assert.snapshot(await recording(state));
        });
    }

    test('colours the profile of a member with everything finished', async (t) => {
        const { va } = state.cast;
        await seedTask(state, va, { status: 'COMPLETED' });
        await run(state, command('profile', va));
        t.assert.snapshot(await recording(state));
    });

    test('shows a member who has left the server without crew roles', async (t) => {
        const { stranger, owner } = state.cast;
        await state.User.create({
            discordId: stranger.id,
            username: stranger.username,
            joinedAt: new Date('2026-02-01'),
        });
        await run(state, command('profile', owner, { user: stranger }));
        t.assert.snapshot(await recording(state));
    });
});

describe('/card', () => {
    test('shows an archived card for a deboarded member', async (t) => {
        const { va } = state.cast;
        await setUser(state, va, {
            isDeboarded: true,
            deboarded_at: new Date(NOW - DAY),
            deboarded_statusMessage: 'Graduated',
        });
        const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('unused'));
        await run(state, command('card', va));
        t.assert.snapshot({ ...(await recording(state)), fetchCalls: fetch.mock.callCount() });
    });

    test('attaches the card image from the card service', async (t) => {
        const fetch = t.mock.method(
            globalThis,
            'fetch',
            async () => new Response(Buffer.from('PNG-BYTES'), { status: 200 }),
        );
        await run(state, command('card', state.cast.owner, { user: state.cast.va }));
        t.assert.snapshot({ ...(await recording(state)), fetched: fetch.mock.calls.map((call) => call.arguments[0]) });
    });

    test('reports a card the service does not have', async (t) => {
        t.mock.method(globalThis, 'fetch', async () => new Response('missing', { status: 404 }));
        await run(state, command('card', state.cast.newcomer));
        t.assert.snapshot(await recording(state));
    });

    test('reports a card service that cannot be reached', async (t) => {
        t.mock.method(globalThis, 'fetch', async () => {
            throw new TypeError('fetch failed');
        });
        await run(state, command('card', state.cast.va));
        t.assert.snapshot(await recording(state));
    });
});

describe('/strike', () => {
    test('refuses a member who is not a manager or owner', async (t) => {
        await run(state, command('strike', state.cast.va, {}, 'list'));
        t.assert.snapshot(await recording(state));
    });

    test('lists nobody when there are no strikes', async (t) => {
        await run(state, command('strike', state.cast.manager, {}, 'list'));
        t.assert.snapshot(await recording(state));
    });

    test('lists members with strikes', async (t) => {
        await setUser(state, state.cast.va, { strikes: 2 });
        await setUser(state, state.cast.editor, { strikes: 1 });
        await run(state, command('strike', state.cast.owner, {}, 'list'));
        t.assert.snapshot(await recording(state));
    });

    test('adds a strike and creates a record for a new member', async (t) => {
        await run(
            state,
            command('strike', state.cast.manager, { user: state.cast.newcomer, reason: 'Missed call' }, 'add'),
        );
        t.assert.snapshot(await recording(state));
    });

    test('demotes a member who reaches three strikes', async (t) => {
        const { owner, editor } = state.cast;
        await setUser(state, editor, { strikes: 2 });
        await run(state, command('strike', owner, { user: editor, reason: 'Third miss' }, 'add'));
        t.assert.snapshot(await recording(state));
    });

    test('caps strikes at three without demoting twice', async (t) => {
        const { owner, editor } = state.cast;
        await setUser(state, editor, { strikes: 3 });
        const member = state.world.guild.members.cache.get(editor.id);
        member.roles.cache.clear();
        await run(state, command('strike', owner, { user: editor, reason: 'Again' }, 'add'));
        t.assert.snapshot(await recording(state));
    });

    test('removes a strike', async (t) => {
        await setUser(state, state.cast.va, { strikes: 2 });
        await run(state, command('strike', state.cast.manager, { user: state.cast.va }, 'remove'));
        t.assert.snapshot(await recording(state));
    });

    test('keeps strikes at zero when removing from a clean record', async (t) => {
        await run(state, command('strike', state.cast.manager, { user: state.cast.va }, 'remove'));
        t.assert.snapshot(await recording(state));
    });

    test('answers an unknown subcommand', async (t) => {
        await run(state, command('strike', state.cast.manager, { user: state.cast.va }, 'reset'));
        t.assert.snapshot(await recording(state));
    });

    test('logs to the console when the log channel is missing', async (t) => {
        state.world.channels.delete(config.LOG_CHANNEL_ID);
        await run(state, command('strike', state.cast.manager, { user: state.cast.va, reason: 'x' }, 'add'));
        t.assert.snapshot(await recording(state));
    });
});

describe('/onboard and /deboard', () => {
    test('refuses onboarding by a non-owner', async (t) => {
        await run(state, command('onboard', state.cast.manager, { user: state.cast.newcomer }));
        t.assert.snapshot(await recording(state));
    });

    test('onboards a new member', async (t) => {
        await run(state, command('onboard', state.cast.owner, { user: state.cast.newcomer }));
        t.assert.snapshot(await recording(state));
    });

    test('reports a member who is already onboarded', async (t) => {
        await setUser(state, state.cast.va, { strikes: 1 });
        await run(state, command('onboard', state.cast.owner, { user: state.cast.va }));
        t.assert.snapshot(await recording(state));
    });

    test('brings back a deboarded member', async (t) => {
        await setUser(state, state.cast.va, { isDeboarded: true, deboarded_at: new Date(NOW - DAY), strikes: 2 });
        await run(state, command('onboard', state.cast.owner, { user: state.cast.va }));
        t.assert.snapshot(await recording(state));
    });

    test('refuses deboarding by a non-owner', async (t) => {
        await run(state, command('deboard', state.cast.manager, { user: state.cast.va }));
        t.assert.snapshot(await recording(state));
    });

    test('reports deboarding someone with no record', async (t) => {
        await run(state, command('deboard', state.cast.owner, { user: state.cast.newcomer }));
        t.assert.snapshot(await recording(state));
    });

    test('reports deboarding someone already deboarded', async (t) => {
        await setUser(state, state.cast.va, { isDeboarded: true });
        await run(state, command('deboard', state.cast.owner, { user: state.cast.va }));
        t.assert.snapshot(await recording(state));
    });

    test('deboards with the default message and keeps their tasks', async (t) => {
        await seedTask(state, state.cast.va, { status: 'COMPLETED' });
        await run(state, command('deboard', state.cast.owner, { user: state.cast.va }));
        t.assert.snapshot(await recording(state));
    });

    test('deboards with a custom message', async (t) => {
        await run(state, command('deboard', state.cast.owner, { user: state.cast.va, message: 'Off to university' }));
        t.assert.snapshot(await recording(state));
    });
});

describe('/hiatus', () => {
    test('refuses granting hiatus to someone else without being an owner', async (t) => {
        await run(state, command('hiatus', state.cast.manager, { user: state.cast.va, reason: 'needs rest' }));
        t.assert.snapshot(await recording(state));
    });

    test('refuses granting hiatus to someone not onboarded', async (t) => {
        await run(state, command('hiatus', state.cast.owner, { user: state.cast.newcomer, reason: 'x' }));
        t.assert.snapshot(await recording(state));
    });

    test('grants hiatus directly and pauses pending tasks', async (t) => {
        const { owner, va } = state.cast;
        await seedTask(state, va, { taskName: 'Pending skit' });
        await seedTask(state, va, { taskName: 'Late skit', status: 'LATE', deadline: new Date(NOW - DAY) });
        await run(state, command('hiatus', owner, { user: va, reason: 'Family' }));
        t.assert.snapshot(await recording(state));
    });

    test('refuses a request from someone not onboarded', async (t) => {
        await run(state, command('hiatus', state.cast.newcomer, { reason: 'x' }));
        t.assert.snapshot(await recording(state));
    });

    test('sends a self request for approval', async (t) => {
        await run(state, command('hiatus', state.cast.va, { reason: 'Exams' }));
        t.assert.snapshot(await recording(state));
    });

    test('treats naming yourself as a self request', async (t) => {
        await run(state, command('hiatus', state.cast.owner, { user: state.cast.owner, reason: 'Trip' }));
        t.assert.snapshot(await recording(state));
    });

    test('asks for a reason when none is given', async (t) => {
        await run(state, command('hiatus', state.cast.va, {}));
        t.assert.snapshot(await recording(state));
    });
});

describe('/endhiatus', () => {
    test('refuses ending someone else’s hiatus without being an owner', async (t) => {
        await run(state, command('endhiatus', state.cast.manager, { user: state.cast.va }));
        t.assert.snapshot(await recording(state));
    });

    test('refuses someone not onboarded', async (t) => {
        await run(state, command('endhiatus', state.cast.newcomer));
        t.assert.snapshot(await recording(state));
    });

    test('refuses a member who is not on hiatus', async (t) => {
        await run(state, command('endhiatus', state.cast.va));
        t.assert.snapshot(await recording(state));
    });

    test('ends a hiatus with no pending tasks', async (t) => {
        await setUser(state, state.cast.va, { isOnHiatus: true });
        await run(state, command('endhiatus', state.cast.va));
        t.assert.snapshot(await recording(state));
    });

    test('restores standard tasks and leaves custom ones paused', async (t) => {
        const { owner, editor } = state.cast;
        await setUser(state, editor, { isOnHiatus: true });
        await seedTask(state, editor, {
            taskName: 'Paused skit',
            deadline: new Date('2099-12-31'),
            hasExtended: true,
            extensionCount: 1,
            firstReminderSent: true,
            finalReminderSent: true,
        });
        await seedTask(state, editor, {
            taskName: 'Paused MV',
            roleCategoryId: ROLE.EDITOR,
            taskType: 'color_mv',
            deadline: new Date('2099-12-31'),
        });
        await seedTask(state, editor, {
            taskName: 'Custom chorus',
            taskType: 'custom',
            deadline: new Date('2099-12-31'),
        });
        await run(state, command('endhiatus', owner, { user: editor }));
        t.assert.snapshot(await recording(state));
    });
});

describe('/checkfree', () => {
    test('reports a member with no record', async (t) => {
        await run(state, command('checkfree', state.cast.owner, { user: state.cast.newcomer }));
        t.assert.snapshot(await recording(state));
    });

    test('shows a busy member and their current task', async (t) => {
        await seedTask(state, state.cast.va, { taskName: 'Busy skit' });
        await run(state, command('checkfree', state.cast.owner, { user: state.cast.va }));
        t.assert.snapshot(await recording(state));
    });

    test('shows a free member with their last completed task', async (t) => {
        await seedTask(state, state.cast.va, {
            taskName: 'Older',
            status: 'COMPLETED',
            completedAt: new Date(NOW - 9 * DAY),
        });
        await seedTask(state, state.cast.va, {
            taskName: 'Newer',
            status: 'COMPLETED',
            completedAt: new Date(NOW - 2 * DAY),
        });
        await run(state, command('checkfree', state.cast.owner, { user: state.cast.va }));
        t.assert.snapshot(await recording(state));
    });

    test('says "was due" for a completion with no recorded time', async (t) => {
        await seedTask(state, state.cast.va, {
            taskName: 'Legacy',
            status: 'COMPLETED',
            deadline: new Date(NOW - 20 * DAY),
        });
        await run(state, command('checkfree', state.cast.owner, { user: state.cast.va }));
        t.assert.snapshot(await recording(state));
    });

    test('shows a free member on hiatus with no history', async (t) => {
        await setUser(state, state.cast.va, { isOnHiatus: true });
        await run(state, command('checkfree', state.cast.owner, { user: state.cast.va }));
        t.assert.snapshot(await recording(state));
    });

    test('reports that everyone is busy', async (t) => {
        for (const user of [state.cast.owner, state.cast.manager, state.cast.va, state.cast.editor, state.cast.quiet]) {
            await seedTask(state, user);
        }
        await run(state, command('checkfree', state.cast.owner));
        t.assert.snapshot(await recording(state));
    });

    test('lists free members, split into active and on hiatus', async (t) => {
        await seedTask(state, state.cast.owner);
        await seedTask(state, state.cast.va, { taskName: 'Finished skit', status: 'COMPLETED' });
        await setUser(state, state.cast.quiet, { isOnHiatus: true });
        await run(state, command('checkfree', state.cast.manager));
        t.assert.snapshot(await recording(state));
    });

    test('splits a long list across several fields', async (t) => {
        for (let index = 0; index < 30; index += 1) {
            const discordId = `2000000000000000${String(index).padStart(2, '0')}`;
            await state.User.create({ discordId, username: `bulk.${index}`, isOnHiatus: index % 2 === 0 });
        }
        await run(state, command('checkfree', state.cast.manager));
        t.assert.snapshot(await recording(state));
    });
});
