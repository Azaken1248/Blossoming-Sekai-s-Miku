import { after, before, beforeEach, mock, snapshot } from 'node:test';
import config from '../../config.js';
import { startDatabase } from '../support/database.js';
import { DiscordWorld } from '../support/discord.js';
import { loadBot } from '../support/bot.js';

export const NOW = Date.parse('2026-06-15T12:00:00.000Z');
export const DAY = 24 * 60 * 60 * 1000;
export const WEEK = 7 * DAY;
export const ROLE = {
    VA: '1449411540351713503',
    SVA: '1449413545224704071',
    EDITOR: '1449416050457186425',
    COMPOSER: '1449415914624909333',
};
export const MIKU_ID = '1449394728863924354';
export const GENERAL_CHANNEL_ID = '700000000000000001';
export const HIATUS_CHANNEL_ID = '700000000000000002';

const LONG_TIMER_MS = 15 * 60 * 1000;
const OBJECT_ID = /(?<![0-9a-f])[0-9a-f]{24}(?![0-9a-f])/g;

snapshot.setDefaultSnapshotSerializers([(value) => JSON.stringify(value, null, 2)]);

const pinLocale = (prototype) => {
    for (const method of ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString']) {
        const original = prototype[method];
        mock.method(prototype, method, function (_locales, options) {
            return original.call(this, 'en-US', { ...options, timeZone: 'UTC' });
        });
    }
};

const captureLongTimers = (timers) => {
    for (const name of ['setTimeout', 'setInterval']) {
        const original = globalThis[name];
        mock.method(globalThis, name, (callback, ms, ...args) => {
            if (ms >= LONG_TIMER_MS) {
                timers.push({ kind: name, ms, callback });
                return { ref() {}, unref() {}, hasRef: () => false, [Symbol.toPrimitive]: () => 0 };
            }
            return original(callback, ms, ...args);
        });
    }
};

export const useCharacterisation = (name) => {
    const state = { timers: [] };

    before(async () => {
        pinLocale(Date.prototype);
        mock.timers.enable({ apis: ['Date'], now: NOW });
        pinLocale(Date.prototype);
        mock.method(Math, 'random', () => 0.5);
        captureLongTimers(state.timers);
        state.database = await startDatabase(`sekai_char_${name}`);
        state.world = new DiscordWorld({ clock: () => Date.now() });
        state.bot = await loadBot(state.world);
        state.User = (await import('../../DB/Schemas/user.js')).default;
        state.Assignment = (await import('../../DB/Schemas/assignment.js')).default;
    });

    beforeEach(async () => {
        mock.timers.setTime(NOW);
        await state.database.reset();
        state.timers.length = 0;
        state.bot.consoleErrors.length = 0;
        state.cast = buildCast(state.world);
        await seedMembers(state);
    });

    after(async () => {
        await state.database.stop();
    });

    return state;
};

const buildCast = (world) => {
    world.reset();
    world.createChannel({ id: GENERAL_CHANNEL_ID, name: 'general' });
    world.createChannel({ id: HIATUS_CHANNEL_ID, name: 'hiatus-requests' });
    world.createChannel({ id: config.LOG_CHANNEL_ID, name: 'log' });
    world.createChannel({ id: config.REMINDER_CHANNEL_ID, name: 'reminders' });
    world.createChannel({ id: config.APPROVAL_CHANNEL_ID, name: 'approvals' });
    world.createRole({ id: config.OWNER_ROLE_ID, name: 'Owner' });
    for (const id of config.MANAGER_ROLE_IDS) world.createRole({ id, name: `Manager ${id.slice(-3)}` });
    for (const [id, rule] of Object.entries(config.RULES)) world.createRole({ id, name: rule.name });

    const person = (id, username, roles, options = {}) => {
        const user = world.createUser({ id, username, dmFails: options.dmFails ?? false });
        if (options.inGuild !== false) world.addMember(user, { roles });
        return user;
    };

    return {
        owner: person('100000000000000001', 'owner.one', [config.OWNER_ROLE_ID]),
        manager: person('100000000000000002', 'manager.one', [config.MANAGER_ROLE_IDS[0]]),
        va: person('100000000000000003', 'va.one', [ROLE.VA]),
        editor: person('100000000000000004', 'editor.one', [ROLE.EDITOR, ROLE.VA]),
        newcomer: person('100000000000000005', 'new.one', [ROLE.VA]),
        quiet: person('100000000000000006', 'quiet.one', [ROLE.SVA], { dmFails: true }),
        stranger: person('100000000000000007', 'stranger.one', [], { inGuild: false }),
        miku: person(MIKU_ID, 'miku', []),
    };
};

const seedMembers = async (state) => {
    const { owner, manager, va, editor, quiet } = state.cast;
    for (const user of [owner, manager, va, editor, quiet]) {
        await state.User.create({
            discordId: user.id,
            username: user.username,
            joinedAt: new Date('2026-01-10T00:00:00.000Z'),
        });
    }
};

export const seedTask = async (state, user, overrides = {}) => {
    const record = await state.User.findOne({ discordId: user.id });
    const roleCategoryId = overrides.roleCategoryId ?? ROLE.VA;
    const task = await state.Assignment.create({
        userId: record._id,
        discordUserId: user.id,
        roleCategoryId,
        roleName: config.RULES[roleCategoryId]?.name ?? 'Unknown',
        taskType: 'skit',
        taskName: '',
        assignedAt: new Date(NOW - 3 * DAY),
        deadline: new Date(NOW + 11 * DAY),
        ...overrides,
    });
    await state.User.updateOne({ _id: record._id }, { $push: { assignments: task._id } });
    return task;
};

export const setUser = (state, user, fields) => state.User.updateOne({ discordId: user.id }, { $set: fields });

const dumpDatabase = async (state) => {
    const users = await state.User.find({}, { __v: 0 }).sort({ discordId: 1 }).lean();
    const assignments = await state.Assignment.find({}, { __v: 0 })
        .sort({ discordUserId: 1, assignedAt: 1, taskName: 1, taskType: 1 })
        .lean();
    return { users, assignments };
};

export const recording = async (state, extra = {}) => {
    const raw = {
        discord: state.world.take(),
        ...extra,
        errors: state.bot.consoleErrors.map((args) =>
            args.map((arg) => (arg instanceof Error ? `${arg.name}: ${arg.message}` : String(arg))),
        ),
        timers: state.timers.map(({ kind, ms }) => ({ kind, ms })),
        database: await dumpDatabase(state),
    };
    const ids = new Map();
    const text = JSON.stringify(raw).replace(OBJECT_ID, (hex) => {
        if (!ids.has(hex)) ids.set(hex, `<id ${ids.size + 1}>`);
        return ids.get(hex);
    });
    return JSON.parse(text);
};

export const run = async (state, interaction) => {
    await state.bot.emit('interactionCreate', interaction);
    return interaction;
};
