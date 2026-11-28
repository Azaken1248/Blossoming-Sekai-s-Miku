import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createGuildLookup } from '../../API/discord/guild.ts';

const ROLES = new Map([
    ['r0', '@everyone'],
    ['r1', 'Voice Actor'],
]);

const fakeRest = (members = new Map(), { user = null, member = null, fail = false } = {}) => {
    const calls = [];
    const rest = {
        roleNames: async (...args) => {
            calls.push(['roleNames', ...args]);
            return ROLES;
        },
        members: async (...args) => {
            calls.push(['members', ...args]);
            return members;
        },
        user: async (...args) => {
            calls.push(['user', ...args]);
            if (fail) throw new Error('down');
            return user;
        },
        member: async (...args) => {
            calls.push(['member', ...args]);
            return member;
        },
    };
    return { calls, rest };
};

const auth = (botToken, guildId) => () => ({ botToken, guildId });

describe('avatar', () => {
    test('needs a token', async () => {
        const { calls, rest } = fakeRest();
        assert.deepEqual(await createGuildLookup(rest, auth(undefined, 'g')).avatar('1'), { avatarUrl: null });
        assert.deepEqual(calls, []);
    });
    test('without a guild asks only for the user', async () => {
        const { calls, rest } = fakeRest(new Map(), { user: { id: '1', avatar: 'h' } });
        assert.deepEqual(await createGuildLookup(rest, auth('t', undefined)).avatar('1'), {
            avatarUrl: 'https://cdn.discordapp.com/avatars/1/h.png?size=512',
        });
        assert.deepEqual(calls, [['user', '1', 't']]);
    });
    test('warms the role map when the member has roles', async () => {
        const { calls, rest } = fakeRest(new Map(), { member: { roles: ['r1'] } });
        assert.deepEqual(await createGuildLookup(rest, auth('t', 'g')).avatar('1'), { avatarUrl: null });
        assert.deepEqual(calls, [
            ['user', '1', 't'],
            ['member', 'g', '1', 't'],
            ['roleNames', 'g', 't'],
        ]);
    });
    test('a failure leaves the avatar empty', async () => {
        const { rest } = fakeRest(new Map(), { fail: true });
        assert.deepEqual(await createGuildLookup(rest, auth('t', 'g')).avatar('1'), { avatarUrl: null });
    });
});

describe('members', () => {
    const members = new Map([
        ['1', { user: { id: '1', username: 'u1', global_name: 'Global', avatar: 'a' }, roles: ['r0', 'r1', 'r9'] }],
        ['2', { user: { id: '2', username: 'u2' } }],
        ['3', { roles: ['r1'] }],
    ]);

    test('nobody without a token and a guild', async () => {
        const { rest } = fakeRest(members);
        assert.equal(await createGuildLookup(rest, auth('t', undefined)).everyone(), null);
        assert.equal(await createGuildLookup(rest, auth(undefined, 'g')).find('1'), null);
    });
    test('names, avatars and role names for everyone', async () => {
        const { calls, rest } = fakeRest(members);
        const everyone = await createGuildLookup(rest, auth('t', 'g')).everyone();
        assert.deepEqual(Object.fromEntries(everyone), {
            1: {
                displayName: 'Global',
                avatarUrl: 'https://cdn.discordapp.com/avatars/1/a.png?size=512',
                roleNames: ['Voice Actor'],
            },
            2: { displayName: 'u2', avatarUrl: null, roleNames: [] },
            3: { displayName: null, avatarUrl: null, roleNames: ['Voice Actor'] },
        });
        assert.deepEqual(calls, [
            ['roleNames', 'g', 't'],
            ['members', 'g', 't'],
        ]);
    });
    test('one member, or nobody when they are not in the guild', async () => {
        const { calls, rest } = fakeRest(members);
        const lookup = createGuildLookup(rest, auth('t', 'g'));
        assert.deepEqual(await lookup.find('2'), { displayName: 'u2', avatarUrl: null, roleNames: [] });
        assert.equal(await lookup.find('9'), null);
        assert.deepEqual(calls.slice(0, 2), [
            ['members', 'g', 't'],
            ['roleNames', 'g', 't'],
        ]);
    });
});
