import { MINUTE } from '../../Utils/domain/durations.ts';

const DISCORD_API = 'https://discord.com/api/v10';
const PAGE_SIZE = 1000;
const ROLE_TTL = 10 * MINUTE;
const MEMBER_TTL = 2 * MINUTE;

export interface DiscordUser {
    readonly id?: string;
    readonly username?: string;
    readonly global_name?: string | null;
    readonly avatar?: string | null;
}

export interface GuildMember {
    readonly user?: DiscordUser;
    readonly roles?: readonly string[];
}

interface DiscordRole {
    readonly id: string;
    readonly name: string;
}

export interface DiscordAuth {
    readonly botToken: string | undefined;
    readonly guildId: string | undefined;
}

type Fetch = (url: string, init: { readonly headers: Record<string, string> }) => Promise<Response>;

interface Cached<T> {
    guildId: string | null;
    expiresAt: number;
    value: Map<string, T>;
}

const emptyCache = <T>(): Cached<T> => ({ guildId: null, expiresAt: 0, value: new Map() });

const fresh = <T>(cache: Cached<T>, guildId: string, now: number) =>
    cache.guildId === guildId && cache.expiresAt > now && cache.value.size > 0;

export const readDiscordAuth = (env: NodeJS.ProcessEnv = process.env): DiscordAuth => ({
    botToken: env['BOT_TOKEN'] || env['DISCORD_TOKEN'],
    guildId: env['GUILD_ID'] || env['DISCORD_GUILD_ID'] || env['SERVER_GUILD_ID'],
});

export const avatarUrl = (discordId: string | undefined, hash: string | null | undefined): string | null => {
    if (!discordId || !hash) return null;
    const extension = hash.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${discordId}/${hash}.${extension}?size=512`;
};

interface Transport {
    readonly call: (path: string, botToken: string) => Promise<Response>;
    readonly json: <T>(path: string, botToken: string) => Promise<T | null>;
    readonly now: () => number;
}

const createTransport = (fetch: Fetch, now: () => number): Transport => {
    const call = (path: string, botToken: string) =>
        fetch(`${DISCORD_API}${path}`, { headers: { Authorization: `Bot ${botToken}` } });
    const json = async <T>(path: string, botToken: string): Promise<T | null> => {
        const response = await call(path, botToken);
        if (!response.ok) return null;
        return (await response.json()) as T;
    };
    return { call, json, now };
};

const createRoleDirectory = ({ json, now }: Transport) => {
    const cache = emptyCache<string>();
    return async (guildId: string, botToken: string): Promise<Map<string, string>> => {
        const at = now();
        if (fresh(cache, guildId, at)) return cache.value;
        const roles = await json<DiscordRole[]>(`/guilds/${guildId}/roles`, botToken);
        if (!Array.isArray(roles)) return cache.value;
        Object.assign(cache, {
            guildId,
            expiresAt: at + ROLE_TTL,
            value: new Map(roles.map((role) => [role.id, role.name])),
        });
        return cache.value;
    };
};

const createMemberDirectory = ({ call, now }: Transport) => {
    const cache = emptyCache<GuildMember>();

    const page = async (guildId: string, botToken: string, after: string | null) => {
        const suffix = after ? `?limit=${String(PAGE_SIZE)}&after=${after}` : `?limit=${String(PAGE_SIZE)}`;
        const response = await call(`/guilds/${guildId}/members${suffix}`, botToken);
        if (!response.ok) return [];
        const chunk: unknown = await response.json();
        return Array.isArray(chunk) ? (chunk as GuildMember[]) : [];
    };

    const everyone = async (guildId: string, botToken: string) => {
        const found: GuildMember[] = [];
        let after: string | null = null;
        for (;;) {
            const chunk = await page(guildId, botToken, after);
            found.push(...chunk);
            after = chunk.length >= PAGE_SIZE ? (chunk.at(-1)?.user?.id ?? null) : null;
            if (!after) return found;
        }
    };

    return async (guildId: string, botToken: string): Promise<Map<string, GuildMember>> => {
        const at = now();
        if (fresh(cache, guildId, at)) return cache.value;
        const found = await everyone(guildId, botToken);
        Object.assign(cache, {
            guildId,
            expiresAt: at + MEMBER_TTL,
            value: new Map(found.flatMap((member) => (member.user?.id ? [[member.user.id, member] as const] : []))),
        });
        return cache.value;
    };
};

export const createDiscordRest = ({ fetch, now }: { readonly fetch: Fetch; readonly now: () => number }) => {
    const transport = createTransport(fetch, now);
    return {
        roleNames: createRoleDirectory(transport),
        members: createMemberDirectory(transport),
        user: (discordId: string, botToken: string) => transport.json<DiscordUser>(`/users/${discordId}`, botToken),
        member: (guildId: string, discordId: string, botToken: string) =>
            transport.json<GuildMember>(`/guilds/${guildId}/members/${discordId}`, botToken),
    };
};

export type DiscordRest = ReturnType<typeof createDiscordRest>;

export const discordRest = createDiscordRest({
    fetch: (url, init) => globalThis.fetch(url, init),
    now: () => Date.now(),
});
