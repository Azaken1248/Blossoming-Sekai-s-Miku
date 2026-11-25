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

const state = useCharacterisation('boundaries');
const HOUR = 60 * 60 * 1000;
const command = (name, user, options = {}, subcommand = null, extra = {}) =>
    state.world.command(name, { user, options, subcommand, ...extra });
const click = (customId, user, embeds = [{ title: 'Review me' }]) =>
    state.world.button(customId, { user, message: { embeds } });
const unknownInteraction = () => Object.assign(new Error('Unknown interaction'), { code: 10062 });

const failFirstEditReply = (interaction) => {
    const editReply = interaction.editReply;
    let failed = false;
    interaction.editReply = async (payload) => {
        if (!failed) {
            failed = true;
            throw Object.assign(new Error('Service unavailable'), { status: 503 });
        }
        return editReply(payload);
    };
    return interaction;
};

const beforeQuery = (t, model, method, callNumber, hook) => {
    const original = model[method];
    let calls = 0;
    t.mock.method(model, method, function (...args) {
        const query = original.apply(this, args);
        calls += 1;
        if (calls === callNumber) {
            const exec = query.exec.bind(query);
            query.exec = async (...execArgs) => {
                await hook();
                return exec(...execArgs);
            };
        }
        return query;
    });
};

const failOnce = (t, model, method, message) =>
    t.mock.method(
        model,
        method,
        () => {
            throw new Error(message);
        },
        { times: 1 },
    );

const withConfig = (t, apply) => {
    const restore = apply();
    t.after(restore);
};

const startUp = async () => {
    state.bot.restCalls.length = 0;
    await state.bot.ready();
};

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
