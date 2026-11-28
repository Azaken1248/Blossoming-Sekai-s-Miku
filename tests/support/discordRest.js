import { createHash } from 'node:crypto';

export const TOKEN = 'fake-bot-token';
const DISCORD_API = 'https://discord.com/api/v10';
const PAGE = 1000;

const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const image = (url) => new Response(Buffer.from(`image:${url}`), { headers: { 'content-type': 'image/png' } });

const membersPage = (members, query) => {
    const after = query.get('after');
    const sorted = [...members].sort((left, right) => left.user.id.localeCompare(right.user.id));
    const start = after ? sorted.findIndex((member) => member.user.id === after) + 1 : 0;
    return sorted.slice(start, start + Number(query.get('limit') ?? PAGE));
};

const discordAnswer = (world, path, query) => {
    const [, root, id, kind, memberId] = path.split('/');
    if (root === 'guilds' && kind === 'roles') return json(world.roles);
    if (root === 'guilds' && kind === 'members' && memberId) {
        const member = world.members.find((candidate) => candidate.user.id === memberId);
        return member ? json(member) : json({ message: 'Unknown Member' }, 404);
    }
    if (root === 'guilds' && kind === 'members') return json(membersPage(world.members, query));
    if (root === 'users' && world.users[id]) return json(world.users[id]);
    return json({ message: 'Unknown' }, 404);
};

export const fakeDiscordRest = (overrides = {}) => {
    const world = { roles: [], members: [], users: {}, failing: [], throwing: [], ...overrides };
    const calls = [];
    const fetch = async (input, init = {}) => {
        const url = new URL(String(input));
        const authorised = init.headers?.Authorization === `Bot ${TOKEN}`;
        calls.push(authorised ? `${url.pathname}${url.search}` : `${url.origin}${url.pathname}${url.search}`);
        const target = `${url.pathname}${url.search}`;
        if (world.throwing.some((pattern) => target.includes(pattern))) throw new Error('network down');
        if (world.failing.some((pattern) => target.includes(pattern))) return json({ message: 'Nope' }, 500);
        if (String(input).startsWith(DISCORD_API)) {
            return discordAnswer(world, url.pathname.slice('/api/v10'.length), url.searchParams);
        }
        return image(`${url.origin}${url.pathname}`);
    };
    return { world, calls, fetch };
};

export const guildMember = (id, { name, globalName, avatar, roles = [] } = {}) => ({
    user: { id, username: name ?? `user${id.slice(-3)}`, global_name: globalName ?? null, avatar: avatar ?? null },
    roles,
});

export const hideDataUris = (text) =>
    text.replace(/data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)/g, (_uri, mime, payload) => {
        const digest = createHash('sha256').update(payload).digest('hex').slice(0, 12);
        return `<${mime} ${digest} ${String(payload.length)}>`;
    });
