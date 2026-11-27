import { mock } from 'node:test';

export const loadBot = async (world, { silent = true, login = (token) => Promise.resolve(token) } = {}) => {
    const discord = await import('discord.js');
    const handlers = { on: new Map(), once: new Map() };
    const restCalls = [];
    const consoleErrors = [];

    class FakeClient {
        constructor(options) {
            this.options = options;
            Object.assign(this, world.client);
            world.client = this;
        }

        on(event, handler) {
            handlers.on.set(event, handler);
            return this;
        }

        once(event, handler) {
            handlers.once.set(event, handler);
            return this;
        }

        login(token) {
            this.token = token;
            return login(token);
        }
    }

    class FakeREST {
        setToken() {
            return this;
        }

        put(route, body) {
            restCalls.push({ route, body });
            return Promise.resolve([]);
        }
    }

    const { default: _original, ...named } = discord;
    const replaced = { ...named, Client: FakeClient, REST: FakeREST };
    mock.module('discord.js', { exports: { ...replaced, default: { ...replaced } } });
    mock.module('dotenv', { exports: { default: { config: () => ({ parsed: {} }) } } });

    if (silent) {
        mock.method(console, 'log', () => {});
        mock.method(console, 'warn', () => {});
        mock.method(console, 'error', (...args) => consoleErrors.push(args));
    }

    await import('../../bot.js');

    return {
        handlers,
        restCalls,
        consoleErrors,
        emit: (event, ...args) => handlers.on.get(event)(...args),
        ready: () => handlers.once.get('clientReady')(world.client),
    };
};
