import { describe, test } from 'node:test';
import config from '../../config.js';
import { DAY, NOW, ROLE, recording, seedTask, setUser, useCharacterisation } from './harness.js';

const state = useCharacterisation('scheduler');
const HOUR = 60 * 60 * 1000;

const startUp = async () => {
    state.bot.restCalls.length = 0;
    await state.bot.ready();
};

describe('startup', () => {
    test('registers every slash command, runs the scheduler once and schedules it hourly', async (t) => {
        await startUp();
        const registered = state.bot.restCalls.map(({ route, body }) => ({ route, body }));
        t.assert.snapshot({ registered, ...(await recording(state)) });
    });

    test('carries on when command registration fails', async (t) => {
        const restCalls = state.bot.restCalls;
        const original = restCalls.push;
        restCalls.push = () => {
            throw new Error('Missing Access');
        };
        try {
            await startUp();
        } finally {
            restCalls.push = original;
        }
        t.assert.snapshot(await recording(state));
    });
});

describe('scheduler pass', () => {
    test('skips the run when the bot is in no server', async (t) => {
        const guilds = state.world.client.guilds.cache;
        const [guild] = guilds.values();
        guilds.clear();
        try {
            await seedTask(state, state.cast.va, { deadline: new Date(NOW - HOUR) });
            await startUp();
        } finally {
            guilds.set(guild.id, guild);
        }
        t.assert.snapshot(await recording(state));
    });

    test('sends first and final reminders by task length, and skips members on hiatus', async (t) => {
        const { va, editor, quiet } = state.cast;
        await seedTask(state, va, {
            taskName: 'Short first',
            assignedAt: new Date(NOW - 5 * DAY),
            deadline: new Date(NOW + 1.5 * DAY),
        });
        await seedTask(state, va, {
            taskName: 'Short final',
            assignedAt: new Date(NOW - 6 * DAY),
            deadline: new Date(NOW + 10 * HOUR),
            firstReminderSent: true,
        });
        await seedTask(state, editor, {
            taskName: 'Medium first',
            roleCategoryId: ROLE.EDITOR,
            taskType: 'story',
            assignedAt: new Date(NOW - 16 * DAY),
            deadline: new Date(NOW + 4 * DAY),
        });
        await seedTask(state, editor, {
            taskName: 'Long first',
            roleCategoryId: ROLE.EDITOR,
            taskType: '2d_mv',
            assignedAt: new Date(NOW - 30 * DAY),
            deadline: new Date(NOW + 6 * DAY),
        });
        await seedTask(state, editor, {
            taskName: 'Not yet',
            assignedAt: new Date(NOW - DAY),
            deadline: new Date(NOW + 13 * DAY),
        });
        await seedTask(state, editor, {
            taskName: 'Both sent',
            assignedAt: new Date(NOW - 6 * DAY),
            deadline: new Date(NOW + 10 * HOUR),
            firstReminderSent: true,
            finalReminderSent: true,
        });
        await setUser(state, quiet, { isOnHiatus: true });
        await seedTask(state, quiet, {
            taskName: 'Paused',
            roleCategoryId: ROLE.SVA,
            taskType: 'short_cover',
            assignedAt: new Date(NOW - 5 * DAY),
            deadline: new Date(NOW + DAY),
        });
        await startUp();
        t.assert.snapshot(await recording(state));
    });

    test('marks overdue tasks late, adds strikes and demotes at three', async (t) => {
        const { va, editor, quiet } = state.cast;
        await seedTask(state, va, { taskName: 'Missed skit', deadline: new Date(NOW - HOUR) });
        await setUser(state, editor, { strikes: 2 });
        await seedTask(state, editor, {
            taskName: 'Missed MV',
            roleCategoryId: ROLE.EDITOR,
            taskType: 'color_mv',
            deadline: new Date(NOW - DAY),
        });
        await setUser(state, quiet, { isOnHiatus: true });
        await seedTask(state, quiet, {
            taskName: 'Hiatus overdue',
            roleCategoryId: ROLE.SVA,
            taskType: 'short_cover',
            deadline: new Date(NOW - DAY),
        });
        await seedTask(state, va, { taskName: 'Already late', status: 'LATE', deadline: new Date(NOW - 3 * DAY) });
        await startUp();
        t.assert.snapshot(await recording(state));
    });

    test('skips an overdue task whose member record is gone', async (t) => {
        const { va } = state.cast;
        await seedTask(state, va, { taskName: 'Orphan', deadline: new Date(NOW - HOUR) });
        await state.User.deleteOne({ discordId: va.id });
        await startUp();
        t.assert.snapshot(await recording(state));
    });

    test('carries on when the reminder and log channels are missing', async (t) => {
        const { va } = state.cast;
        state.world.channels.delete(config.REMINDER_CHANNEL_ID);
        state.world.channels.delete(config.LOG_CHANNEL_ID);
        await seedTask(state, va, {
            taskName: 'Due soon',
            assignedAt: new Date(NOW - 6 * DAY),
            deadline: new Date(NOW + 10 * HOUR),
        });
        await seedTask(state, va, { taskName: 'Overdue', deadline: new Date(NOW - HOUR) });
        await startUp();
        t.assert.snapshot(await recording(state));
    });

    test('the hourly run does the same work as the startup run', async (t) => {
        await startUp();
        const [interval] = state.timers.filter(({ kind }) => kind === 'setInterval');
        state.world.take();
        await seedTask(state, state.cast.va, { taskName: 'Overdue later', deadline: new Date(NOW - HOUR) });
        interval.callback();
        for (let attempt = 0; attempt < 50; attempt += 1) {
            const task = await state.Assignment.findOne({ taskName: 'Overdue later' });
            if (task.status === 'LATE' && state.world.log.length > 0) break;
            await new Promise((resolve) => setImmediate(resolve));
        }
        t.assert.snapshot(await recording(state));
    });
});
