import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startDatabase } from '../support/database.js';
import { DiscordWorld } from '../support/discord.js';
import { loadBot } from '../support/bot.js';

let database;
let world;
let bot;

before(async () => {
    database = await startDatabase('sekai_bot_ping');
    world = new DiscordWorld({ clock: () => Date.parse('2026-06-15T12:00:00.000Z') });
    world.createChannel({ id: '700000000000000001', name: 'general' });
    bot = await loadBot(world);
});

after(async () => {
    await database.stop();
});

test('/ping defers, then reports the response time', async () => {
    const user = world.createUser({ id: '100000000000000001', username: 'member.one' });
    world.addMember(user);
    await bot.emit('interactionCreate', world.command('ping', { user }));
    const [deferred, checking, result] = world.take();
    assert.equal(deferred.kind, 'deferReply');
    assert.deepEqual(checking, {
        kind: 'editReply',
        target: user.id,
        payload: { content: 'Checking connection... ♪' },
    });
    assert.equal(result.payload.embeds[0].title, '🎤 Connection Check!');
    assert.deepEqual(result.payload.embeds[0].fields[0], { name: 'Response Time', value: '0ms', inline: true });
    assert.deepEqual(bot.consoleErrors, []);
});
