import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { avatarUrl, createDiscordRest, readDiscordAuth } from '../../API/discord/rest.ts';
import { createImageLoader } from '../../API/cards/images.ts';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

const scripted = (answers) => {
    const calls = [];
    const fetch = async (url) => {
        calls.push(url.replace('https://discord.com/api/v10', ''));
        return answers.shift() ?? json([]);
    };
    return { calls, rest: createDiscordRest({ fetch, now: () => 0 }) };
};

describe('readDiscordAuth', () => {
    test('prefers BOT_TOKEN and GUILD_ID', () => {
        const env = { BOT_TOKEN: 'a', DISCORD_TOKEN: 'b', GUILD_ID: '1', DISCORD_GUILD_ID: '2', SERVER_GUILD_ID: '3' };
        assert.deepEqual(readDiscordAuth(env), { botToken: 'a', guildId: '1' });
    });
    test('falls back through the older names', () => {
        assert.deepEqual(readDiscordAuth({ DISCORD_TOKEN: 'b', DISCORD_GUILD_ID: '2' }), {
            botToken: 'b',
            guildId: '2',
        });
        assert.deepEqual(readDiscordAuth({ SERVER_GUILD_ID: '3' }), { botToken: undefined, guildId: '3' });
    });
    test('reads the process environment by default', () => {
        assert.equal(typeof readDiscordAuth(), 'object');
    });
});

describe('avatarUrl', () => {
    test('needs an id and a hash', () => {
        assert.equal(avatarUrl(undefined, 'abc'), null);
        assert.equal(avatarUrl('1', null), null);
    });
    test('animated hashes are gifs', () => {
        assert.equal(avatarUrl('1', 'a_x'), 'https://cdn.discordapp.com/avatars/1/a_x.gif?size=512');
        assert.equal(avatarUrl('1', 'x'), 'https://cdn.discordapp.com/avatars/1/x.png?size=512');
    });
});

describe('member paging', () => {
    const page = (count, last = (index) => ({ user: { id: String(index).padStart(4, '0') } })) =>
        Array.from({ length: count }, (_, index) => last(index));

    test('stops when the last member of a full page has no id', async () => {
        const full = page(1000, (index) => (index === 999 ? { roles: [] } : { user: { id: String(index) } }));
        const { calls, rest } = scripted([json(full)]);
        const members = await rest.members('9', 't');
        assert.equal(members.size, 999);
        assert.deepEqual(calls, ['/guilds/9/members?limit=1000']);
    });
    test('treats an answer that is not a list as the end', async () => {
        const { rest } = scripted([json({ message: 'odd' })]);
        assert.equal((await rest.members('9', 't')).size, 0);
    });
    test('a failed role lookup with nothing cached is an empty map', async () => {
        const { rest } = scripted([json({}, 500)]);
        assert.equal((await rest.roleNames('9', 't')).size, 0);
    });
});

describe('image loading', () => {
    test('turns a response into a data URI, defaulting to PNG', async () => {
        const load = createImageLoader(async () => new Response(Buffer.from('hi')));
        assert.equal(await load('x'), 'data:image/png;base64,aGk=');
    });
    test('keeps the content type it was given', async () => {
        const load = createImageLoader(
            async () => new Response(Buffer.from('hi'), { headers: { 'content-type': 'image/gif' } }),
        );
        assert.equal(await load('x'), 'data:image/gif;base64,aGk=');
    });
    test('answers a failure with an empty string', async () => {
        const load = createImageLoader(async () => {
            throw new Error('down');
        });
        assert.equal(await load('x'), '');
    });
});
