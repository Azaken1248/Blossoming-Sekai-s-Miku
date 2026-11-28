import { after, before, beforeEach, mock, snapshot, test } from 'node:test';
import request from 'supertest';
import { startDatabase } from './database.js';
import { fakeDiscordRest, hideDataUris, TOKEN } from './discordRest.js';

export const NOW = Date.parse('2026-06-15T12:00:00.000Z');
export const MINUTE = 60 * 1000;
export const DAY = 24 * 60 * MINUTE;
export const MEMBER = '100000000000000003';
export const OTHER = '100000000000000004';
export const LEFT = '100000000000000005';
export const VA = '1449411540351713503';
const DISCORD_VARIABLES = ['BOT_TOKEN', 'DISCORD_TOKEN', 'GUILD_ID', 'DISCORD_GUILD_ID', 'SERVER_GUILD_ID'];
const OBJECT_ID = /(?<![0-9a-f])[0-9a-f]{24}(?![0-9a-f])/g;

snapshot.setDefaultSnapshotSerializers([(value) => JSON.stringify(value, null, 2)]);

const sortKeys = (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
        : value;

const hideIds = (text) => {
    const ids = new Map();
    return text.replace(OBJECT_ID, (hex) => {
        if (!ids.has(hex)) ids.set(hex, `<id ${String(ids.size + 1)}>`);
        return ids.get(hex);
    });
};

export const useApiWorld = (databaseName) => {
    const world = { rest: fakeDiscordRest(), renders: [], sharpFails: false, guilds: 0 };

    before(async () => {
        for (const name of DISCORD_VARIABLES) Reflect.deleteProperty(process.env, name);
        process.env.API_KEY = 'k'.repeat(40);
        mock.timers.enable({ apis: ['Date'], now: NOW });
        mock.method(globalThis, 'fetch', (...args) => world.rest.fetch(...args));
        const sharp = (input) => ({
            png: (options) => ({
                toBuffer: async () => {
                    if (world.sharpFails) throw new Error('sharp failed');
                    world.renders.push({ options, svg: hideDataUris(input.toString()) });
                    return Buffer.from('png-bytes');
                },
            }),
        });
        mock.module('sharp', { exports: { default: sharp } });
        world.database = await startDatabase(databaseName);
        ({ default: world.app } = await import('../../API/app.js'));
        ({ default: world.User } = await import('../../DB/Schemas/user.ts'));
        ({ default: world.Assignment } = await import('../../DB/Schemas/assignment.ts'));
    });

    beforeEach(async () => {
        for (const name of DISCORD_VARIABLES) Reflect.deleteProperty(process.env, name);
        mock.timers.setTime(NOW);
        world.rest = fakeDiscordRest();
        world.renders = [];
        world.sharpFails = false;
        await world.database.reset();
        await world.User.create({ discordId: MEMBER, username: 'va.one', joinedAt: new Date('2026-01-10') });
        await world.User.create({ discordId: OTHER, username: 'editor.one', joinedAt: new Date('2026-01-11') });
        await world.User.create({ discordId: LEFT, username: 'gone.one', joinedAt: new Date('2026-01-12') });
    });

    after(() => world.database.stop());

    world.connect = (discord = {}, { guild = true } = {}) => {
        process.env.BOT_TOKEN = TOKEN;
        world.guilds += 1;
        if (guild) process.env.GUILD_ID = `90000000000000${String(world.guilds).padStart(4, '0')}`;
        world.rest = fakeDiscordRest(discord);
        return world.rest;
    };

    world.seedTasks = async (discordId, tasks) => {
        const user = await world.User.findOne({ discordId });
        for (const [index, fields] of tasks.entries()) {
            const task = await world.Assignment.create({
                userId: user._id,
                discordUserId: discordId,
                roleCategoryId: VA,
                roleName: 'VA',
                taskType: 'skit',
                taskName: `Task ${String(index + 1)}`,
                assignedAt: new Date(NOW - (index + 2) * DAY),
                deadline: new Date(NOW + 7 * DAY),
                ...fields,
            });
            await world.User.updateOne({ _id: user._id }, { $push: { assignments: task._id } });
        }
    };

    world.get = (path) => request(world.app).get(path).set('Host', 'api.test');

    world.record = async (t, call, { body: shape = (body) => body } = {}) => {
        const errors = t.mock.method(console, 'error', () => {});
        const response = await call;
        const json = response.type === 'application/json';
        const raw = {
            status: response.status,
            type: response.headers['content-type'],
            location: response.headers.location,
            cache: response.headers['cache-control'],
            body: json ? shape(response.body) : hideDataUris(response.text ?? Buffer.from(response.body).toString()),
            discord: world.rest.calls,
            renders: world.renders,
            errors: errors.mock.calls.map(({ arguments: args }) => args.map((arg) => arg?.message ?? String(arg))),
        };
        t.assert.snapshot(JSON.parse(hideIds(JSON.stringify(JSON.parse(JSON.stringify(raw)), sortKeys))));
    };

    world.scenario = (name, run, options) => test(name, (t) => world.record(t, run(t), options));

    return world;
};
