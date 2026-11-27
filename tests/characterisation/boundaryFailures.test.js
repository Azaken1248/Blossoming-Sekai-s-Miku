import { describe, test } from 'node:test';
import config from '../../config.js';
import { HIATUS_CHANNEL_ID, NOW, ROLE, recording, run, seedTask, setUser, useCharacterisation } from './harness.js';
import {
    HOUR,
    unknownInteraction,
    failFirstEditReply,
    beforeQuery,
    failOnce,
    withConfig,
    boundaryActions,
} from './boundaryHelpers.js';

const state = useCharacterisation('boundary_failures');
const { command, click, startUp } = boundaryActions(state);

describe('commands used in a DM', () => {
    for (const [name, options, subcommand] of [
        ['assign', { user: 'va', role: 'VA', task: 'skit' }, null],
        ['bulkassign', { role: 'VA', task: 'skit' }, null],
        ['submit', {}, null],
        ['extension', { reason: 'From a DM' }, null],
        ['strike', { user: 'va', reason: 'From a DM' }, 'add'],
        ['strike', { user: 'va' }, 'remove'],
        ['strike', {}, 'list'],
        ['onboard', { user: 'newcomer' }, null],
        ['deboard', { user: 'va' }, null],
        ['removetask', { user: 'va', task: 'skit' }, null],
        ['hiatus', { reason: 'From a DM' }, null],
        ['endhiatus', {}, null],
        ['profile', {}, null],
        ['tasks', {}, null],
        ['history', {}, null],
        ['card', {}, null],
        ['checkfree', {}, null],
        ['help', {}, null],
        ['ping', {}, null],
        ['uptime', {}, null],
    ]) {
        test(`/${name}${subcommand ? ` ${subcommand}` : ''} from a DM`, async (t) => {
            const { owner } = state.cast;
            t.mock.method(globalThis, 'fetch', async () => new Response('missing', { status: 404 }));
            if (name === 'endhiatus') await setUser(state, owner, { isOnHiatus: true });
            if (name === 'submit') await seedTask(state, owner, { taskName: 'DM skit' });
            const resolved = Object.fromEntries(
                Object.entries(options).map(([key, value]) => [key, key === 'user' ? state.cast[value] : value]),
            );
            await run(state, command(name, owner, resolved, subcommand, { dm: true }));
            t.assert.snapshot(await recording(state));
        });
    }
});

describe('records that change mid-command', () => {
    test('/strike add reports a record deleted before the strike lands', async (t) => {
        const { manager, va } = state.cast;
        beforeQuery(t, state.User, 'findOneAndUpdate', 1, () => state.User.deleteOne({ discordId: va.id }));
        await run(state, command('strike', manager, { user: va, reason: 'Late' }, 'add'));
        t.assert.snapshot(await recording(state));
    });

    test('/strike remove reports a record deleted before the strike is removed', async (t) => {
        const { manager, va } = state.cast;
        await setUser(state, va, { strikes: 1 });
        beforeQuery(t, state.User, 'findOneAndUpdate', 1, () => state.User.deleteOne({ discordId: va.id }));
        await run(state, command('strike', manager, { user: va }, 'remove'));
        t.assert.snapshot(await recording(state));
    });

    test('/onboard of a deboarded member falls back to the old strike count if the record vanishes', async (t) => {
        const { owner, va } = state.cast;
        await setUser(state, va, { isDeboarded: true, strikes: 2 });
        beforeQuery(t, state.User, 'findOneAndUpdate', 1, () => state.User.deleteOne({ discordId: va.id }));
        await run(state, command('onboard', owner, { user: va }));
        t.assert.snapshot(await recording(state));
    });

    test('/endhiatus reports a record deleted after the onboarding check', async (t) => {
        const { va } = state.cast;
        await setUser(state, va, { isOnHiatus: true });
        beforeQuery(t, state.User, 'findOne', 2, () => state.User.deleteOne({ discordId: va.id }));
        await run(state, command('endhiatus', va));
        t.assert.snapshot(await recording(state));
    });

    test('a strike that reaches the limit for someone who left the server demotes nobody', async (t) => {
        const { owner, stranger } = state.cast;
        await state.User.create({ discordId: stranger.id, username: stranger.username, strikes: 2 });
        await run(state, command('strike', owner, { user: stranger, reason: 'Third' }, 'add'));
        t.assert.snapshot(await recording(state));
    });

    test('the scheduler skips the strike when the member record vanishes after marking late', async (t) => {
        const { va } = state.cast;
        await seedTask(state, va, { taskName: 'Vanishing', deadline: new Date(NOW - HOUR) });
        beforeQuery(t, state.User, 'findOneAndUpdate', 1, () => state.User.deleteOne({ discordId: va.id }));
        await startUp();
        t.assert.snapshot(await recording(state));
    });

    test('approving an extension for a task deleted mid-approval reports it gone', async (t) => {
        const task = await seedTask(state, state.cast.va, { taskName: 'Fleeting' });
        beforeQuery(t, state.Assignment, 'findById', 2, () => state.Assignment.deleteOne({ _id: task._id }));
        await run(state, click(`extension_approve_${task._id}`, state.cast.manager));
        t.assert.snapshot(await recording(state));
    });
});

describe('actions that lose a race', () => {
    const complete = (task) =>
        state.Assignment.collection.updateOne({ _id: task._id }, { $set: { status: 'COMPLETED' } });

    test('the scheduler leaves a task alone that was approved after it was listed', async (t) => {
        const task = await seedTask(state, state.cast.va, { taskName: 'Just done', deadline: new Date(NOW - HOUR) });
        beforeQuery(t, state.Assignment, 'findOneAndUpdate', 1, () => complete(task));
        await startUp();
        t.assert.snapshot(await recording(state));
    });

    test('/removetask keeps a task approved after it was found', async (t) => {
        const { owner, va } = state.cast;
        const task = await seedTask(state, va, { taskName: 'Just done' });
        beforeQuery(t, state.Assignment, 'findOneAndDelete', 1, () => complete(task));
        await run(state, command('removetask', owner, { user: va, task: 'Just done' }));
        t.assert.snapshot(await recording(state));
    });

    test('/removetask reports a task already removed by someone else', async (t) => {
        const { owner, va } = state.cast;
        const task = await seedTask(state, va, { taskName: 'Gone' });
        beforeQuery(t, state.Assignment, 'findOneAndDelete', 1, () =>
            state.Assignment.collection.deleteOne({ _id: task._id }),
        );
        await run(state, command('removetask', owner, { user: va, task: 'Gone' }));
        t.assert.snapshot(await recording(state));
    });

    test('/deboard reports a member deboarded by someone else meanwhile', async (t) => {
        const { owner, va } = state.cast;
        beforeQuery(t, state.User, 'findOneAndUpdate', 1, () => setUser(state, va, { isDeboarded: true }));
        await run(state, command('deboard', owner, { user: va }));
        t.assert.snapshot(await recording(state));
    });

    test('/endhiatus reports a hiatus ended by someone else meanwhile', async (t) => {
        const { va } = state.cast;
        await setUser(state, va, { isOnHiatus: true });
        await seedTask(state, va, { deadline: new Date('2099-12-31') });
        beforeQuery(t, state.User, 'updateOne', 1, () =>
            state.User.collection.updateOne({ discordId: va.id }, { $set: { isOnHiatus: false } }),
        );
        await run(state, command('endhiatus', va));
        t.assert.snapshot(await recording(state));
    });

    test('a second extension approval that loses the race is told it was resolved', async (t) => {
        const task = await seedTask(state, state.cast.va, { taskName: 'Contested' });
        beforeQuery(t, state.Assignment, 'findOneAndUpdate', 1, () =>
            state.Assignment.collection.updateOne(
                { _id: task._id },
                { $set: { extensionCount: 1, hasExtended: true } },
            ),
        );
        await run(state, click(`extension_approve_${task._id}`, state.cast.manager));
        t.assert.snapshot(await recording(state));
    });
});

describe('unexpected failures', () => {
    test('a database failure while approving a submission reaches the generic button error', async (t) => {
        const task = await seedTask(state, state.cast.va);
        failOnce(t, state.Assignment, 'findOneAndUpdate', 'database unavailable');
        await run(state, click(`submit_approve_${task._id}`, state.cast.owner));
        t.assert.snapshot(await recording(state));
    });

    test('an approval whose extension length is unusable reports an error', async (t) => {
        const rule = config.RULES[ROLE.EDITOR];
        withConfig(t, () => {
            const saved = rule.extension_skit;
            rule.extension_skit = 0;
            return () => {
                rule.extension_skit = saved;
            };
        });
        const task = await seedTask(state, state.cast.editor, { roleCategoryId: ROLE.EDITOR, taskType: 'skit' });
        await run(state, click(`extension_approve_${task._id}`, state.cast.manager));
        t.assert.snapshot(await recording(state));
    });

    test('a broken role rule during /assign reaches the generic command error', async (t) => {
        withConfig(t, () => {
            Object.defineProperty(config.RULES, '999999999999999998', {
                configurable: true,
                enumerable: true,
                get() {
                    throw new TypeError('rule table corrupted');
                },
            });
            return () => {
                delete config.RULES['999999999999999998'];
            };
        });
        await run(state, command('assign', state.cast.owner, { user: state.cast.va, role: 'Nobody', task: 'skit' }));
        t.assert.snapshot(await recording(state));
    });

    test('a broken role rule during /extension reaches the generic command error', async (t) => {
        await seedTask(state, state.cast.va, { roleCategoryId: '999999999999999998', roleName: 'Broken' });
        withConfig(t, () => {
            Object.defineProperty(config.RULES, '999999999999999998', {
                configurable: true,
                enumerable: false,
                get() {
                    throw new TypeError('rule table corrupted');
                },
            });
            return () => {
                delete config.RULES['999999999999999998'];
            };
        });
        await run(state, command('extension', state.cast.va, { reason: 'busy' }));
        t.assert.snapshot(await recording(state));
    });

    test('a broken role rule during extension approval reaches the generic button error', async (t) => {
        const task = await seedTask(state, state.cast.va, { roleCategoryId: '999999999999999998', roleName: 'Broken' });
        withConfig(t, () => {
            Object.defineProperty(config.RULES, '999999999999999998', {
                configurable: true,
                enumerable: false,
                get() {
                    throw new TypeError('rule table corrupted');
                },
            });
            return () => {
                delete config.RULES['999999999999999998'];
            };
        });
        await run(state, click(`extension_approve_${task._id}`, state.cast.manager));
        t.assert.snapshot(await recording(state));
    });

    test('/checkfree reports a database failure', async (t) => {
        failOnce(t, state.User, 'find', 'connection reset');
        await run(state, command('checkfree', state.cast.manager));
        t.assert.snapshot(await recording(state));
    });

    test('a failed first scheduler run is logged and the hourly run is still scheduled', async (t) => {
        failOnce(t, state.Assignment, 'find', 'connection reset');
        await startUp();
        t.assert.snapshot(await recording(state));
    });

    test('a command error that cannot be reported is logged', async (t) => {
        const interaction = command('assign', state.cast.stranger, { user: state.cast.va, role: 'VA', task: 'skit' });
        interaction.editReply = async () => {
            throw unknownInteraction();
        };
        await run(state, interaction);
        t.assert.snapshot(await recording(state));
    });

    test('a button whose interaction expired before deferring replies with an error', async (t) => {
        const task = await seedTask(state, state.cast.va, { taskName: 'Expired click' });
        const interaction = click(`submit_approve_${task._id}`, state.cast.owner);
        interaction.deferReply = async () => {
            throw unknownInteraction();
        };
        interaction.deferUpdate = interaction.deferReply;
        await run(state, interaction);
        t.assert.snapshot(await recording(state));
    });

    test('a submit picker whose interaction expired replies with an error', async (t) => {
        const task = await seedTask(state, state.cast.va, { taskName: 'Expired pick' });
        const interaction = state.world.stringSelect(`submit_select_${state.cast.va.id}`, {
            user: state.cast.va,
            values: [task._id.toString()],
        });
        interaction.deferReply = async () => {
            throw unknownInteraction();
        };
        interaction.deferUpdate = interaction.deferReply;
        await run(state, interaction);
        t.assert.snapshot(await recording(state));
    });

    test('a bulk-assign picker whose interaction expired replies with an error', async (t) => {
        const { owner, va } = state.cast;
        await run(state, command('bulkassign', owner, { role: 'VA', task: 'skit' }));
        state.world.take();
        const interaction = state.world.userSelect(`bulkassign_select_${NOW}500`, { user: owner, users: [va] });
        interaction.deferReply = async () => {
            throw unknownInteraction();
        };
        interaction.deferUpdate = interaction.deferReply;
        await run(state, interaction);
        t.assert.snapshot(await recording(state));
    });

    test('a hiatus approval that fails after deferring edits the reply with an error', async (t) => {
        failOnce(t, state.User, 'updateOne', 'write conflict');
        await run(
            state,
            click(`hiatus_approve_${state.cast.va.id}`, state.cast.owner, [
                { title: 'Hiatus Request', footer: { text: `Channel: ${HIATUS_CHANNEL_ID}` } },
            ]),
        );
        t.assert.snapshot(await recording(state));
    });

    test('a submit picker that fails after deferring edits the reply with an error', async (t) => {
        const task = await seedTask(state, state.cast.va, { taskName: 'Flaky pick' });
        const interaction = state.world.stringSelect(`submit_select_${state.cast.va.id}`, {
            user: state.cast.va,
            values: [task._id.toString()],
        });
        await run(state, failFirstEditReply(interaction));
        t.assert.snapshot(await recording(state));
    });

    test('a bulk-assign picker that fails after deferring edits the reply with an error', async (t) => {
        const { owner, va } = state.cast;
        await run(state, command('bulkassign', owner, { role: 'VA', task: 'skit' }));
        state.world.take();
        const interaction = state.world.userSelect(`bulkassign_select_${NOW}500`, { user: owner, users: [va] });
        await run(state, failFirstEditReply(interaction));
        t.assert.snapshot(await recording(state));
    });
});
