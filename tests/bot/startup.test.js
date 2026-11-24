import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { DiscordWorld } from '../support/discord.js';
import { loadBot } from '../support/bot.js';

test('a rejected Discord login is logged and exits with status 1', async (t) => {
    t.mock.method(mongoose, 'connect', async () => mongoose);
    const exit = t.mock.method(process, 'exit', () => {});
    const bot = await loadBot(new DiscordWorld(), {
        login: () =>
            Promise.reject(Object.assign(new Error('An invalid token was provided.'), { code: 'TokenInvalid' })),
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(
        bot.consoleErrors.filter(([first]) => String(first).startsWith('[')).map((args) => args.map(String)),
        [['[STARTUP] ❌ Failed to login to Discord:', 'Error: An invalid token was provided.']],
    );
    assert.deepEqual(
        exit.mock.calls.map((call) => call.arguments),
        [[1]],
    );
});
