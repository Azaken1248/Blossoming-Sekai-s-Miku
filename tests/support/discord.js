import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Collection } from 'discord.js';

const toPlain = (value) => (value && typeof value.toJSON === 'function' ? value.toJSON() : value);

const describeFile = (file) => {
    const data = file?.attachment ?? file;
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
    return { name: file?.name ?? null, sha256: createHash('sha256').update(bytes).digest('hex').slice(0, 16) };
};

export const normalizePayload = (payload) => {
    if (payload === undefined || payload === null) return null;
    if (typeof payload === 'string') return { content: payload };
    const result = {};
    if (payload.content !== undefined) result.content = payload.content;
    if (payload.embeds) result.embeds = payload.embeds.map(toPlain);
    if (payload.components) result.components = payload.components.map(toPlain);
    if (payload.files) result.files = payload.files.map(describeFile);
    if (payload.flags !== undefined) result.flags = payload.flags;
    if (payload.ephemeral !== undefined) result.ephemeral = payload.ephemeral;
    return result;
};

export class DiscordWorld extends EventEmitter {
    constructor({ clock = () => Date.now() } = {}) {
        super();
        this.clock = clock;
        this.log = [];
        this.collectors = [];
        this.nextMessageId = 1;
        this.users = new Collection();
        this.channels = new Collection();
        this.roles = new Collection();
        this.guild = this.createGuild();
        this.client = {
            user: this.createUser({ id: '900000000000000001', username: 'miku', bot: true }),
            uptime: 0,
            guilds: { cache: new Collection([[this.guild.id, this.guild]]) },
            ws: { ping: 42 },
        };
    }

    record(kind, target, payload) {
        const entry = { kind, target, payload: normalizePayload(payload) };
        this.log.push(entry);
        return entry;
    }

    take() {
        const entries = this.log;
        this.log = [];
        return entries;
    }

    createMessage(channelId, payload) {
        const id = String(this.nextMessageId++);
        const message = {
            id,
            channelId,
            createdTimestamp: this.clock(),
            embeds: normalizePayload(payload)?.embeds ?? [],
            edit: async (next) => {
                this.record('messageEdit', `${channelId}/${id}`, next);
                return message;
            },
            createMessageComponentCollector: (options = {}) => {
                const collector = new EventEmitter();
                collector.options = options;
                collector.messageId = id;
                collector.stop = (reason = 'user') => collector.emit('end', new Collection(), reason);
                this.collectors.push(collector);
                return collector;
            },
        };
        return message;
    }

    createUser({ id, username, globalName = null, bot = false, dmFails = false }) {
        const user = {
            id,
            username,
            globalName,
            bot,
            tag: `${username}#0`,
            displayName: globalName ?? username,
            avatar: null,
            displayAvatarURL: () => `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(id) % 6n)}.png`,
            avatarURL: () => null,
            toString: () => `<@${id}>`,
            send: async (payload) => {
                if (dmFails) {
                    this.record('dmFailed', id, payload);
                    throw Object.assign(new Error('Cannot send messages to this user'), { code: 50007 });
                }
                this.record('dm', id, payload);
                return this.createMessage(`dm-${id}`, payload);
            },
        };
        this.users.set(id, user);
        return user;
    }

    createRole({ id, name }) {
        const role = { id, name, toString: () => `<@&${id}>` };
        this.roles.set(id, role);
        return role;
    }

    createChannel({ id, name = `channel-${id}` }) {
        const channel = {
            id,
            name,
            isTextBased: () => true,
            toString: () => `<#${id}>`,
            send: async (payload) => {
                this.record('channelSend', id, payload);
                return this.createMessage(id, payload);
            },
        };
        this.channels.set(id, channel);
        return channel;
    }

    createGuild() {
        const members = new Collection();
        const toIds = (value) => [value].flat().map((item) => (typeof item === 'string' ? item : item.id));
        return {
            id: '800000000000000001',
            name: 'Test SEKAI',
            iconURL: () => null,
            members: {
                cache: members,
                fetch: async (query) => {
                    if (typeof query === 'string') {
                        const member = members.get(query);
                        if (!member) throw Object.assign(new Error('Unknown Member'), { code: 10007 });
                        return member;
                    }
                    if (query?.user) return members.filter((member) => toIds(query.user).includes(member.id));
                    return members;
                },
            },
            channels: {
                cache: this.channels,
                fetch: async (id) => {
                    const channel = this.channels.get(id);
                    if (!channel) throw Object.assign(new Error('Unknown Channel'), { code: 10003 });
                    return channel;
                },
            },
            roles: { cache: this.roles },
        };
    }

    addMember(user, { roles = [], nickname = null, joinedAt = new Date('2026-01-01T00:00:00.000Z') } = {}) {
        const roleCache = new Collection(roles.map((roleId) => [roleId, this.roles.get(roleId) ?? { id: roleId }]));
        const toIds = (value) => [value].flat().map((item) => (typeof item === 'string' ? item : item.id));
        const member = {
            id: user.id,
            user,
            nickname,
            displayName: nickname ?? user.displayName,
            joinedAt,
            joinedTimestamp: joinedAt.getTime(),
            guild: this.guild,
            displayAvatarURL: user.displayAvatarURL,
            toString: () => `<@${user.id}>`,
            send: (payload) => user.send(payload),
            roles: {
                cache: roleCache,
                add: async (value) => {
                    for (const id of toIds(value)) roleCache.set(id, this.roles.get(id) ?? { id });
                    this.record('rolesAdd', user.id, { content: toIds(value).join(',') });
                },
                remove: async (value) => {
                    for (const id of toIds(value)) roleCache.delete(id);
                    this.record('rolesRemove', user.id, { content: toIds(value).join(',') });
                },
            },
        };
        this.guild.members.cache.set(user.id, member);
        return member;
    }

    interaction(
        kind,
        {
            user,
            commandName = null,
            subcommand = null,
            options = {},
            customId = null,
            values = [],
            users = [],
            message = null,
        },
    ) {
        const channel = this.channels.first();
        const replyMessage = this.createMessage(channel?.id ?? 'reply', null);
        const interaction = {
            kind,
            user,
            member: this.guild.members.cache.get(user.id) ?? null,
            guild: this.guild,
            guildId: this.guild.id,
            channel,
            channelId: channel?.id ?? null,
            client: this.client,
            commandName,
            customId,
            values,
            users: new Collection(users.map((selected) => [selected.id, selected])),
            message,
            createdTimestamp: this.clock(),
            deferred: false,
            replied: false,
            isChatInputCommand: () => kind === 'command',
            isButton: () => kind === 'button',
            isStringSelectMenu: () => kind === 'stringSelect',
            isUserSelectMenu: () => kind === 'userSelect',
            isRepliable: () => true,
            options: {
                getUser: (name) => options[name] ?? null,
                getMember: (name) => (options[name] ? (this.guild.members.cache.get(options[name].id) ?? null) : null),
                getString: (name) => options[name] ?? null,
                getInteger: (name) => options[name] ?? null,
                getNumber: (name) => options[name] ?? null,
                getBoolean: (name) => options[name] ?? null,
                getSubcommand: () => subcommand,
            },
            deferReply: async (opts) => {
                if (interaction.deferred || interaction.replied) throw new Error('InteractionAlreadyReplied');
                interaction.deferred = true;
                this.record('deferReply', user.id, opts ?? null);
            },
            deferUpdate: async () => {
                if (interaction.deferred || interaction.replied) throw new Error('InteractionAlreadyReplied');
                interaction.deferred = true;
                this.record('deferUpdate', user.id, null);
            },
            reply: async (payload) => {
                if (interaction.deferred || interaction.replied) throw new Error('InteractionAlreadyReplied');
                interaction.replied = true;
                this.record('reply', user.id, payload);
                return replyMessage;
            },
            update: async (payload) => {
                interaction.replied = true;
                this.record('update', user.id, payload);
                return replyMessage;
            },
            editReply: async (payload) => {
                if (!interaction.deferred && !interaction.replied) throw new Error('InteractionNotReplied');
                this.record('editReply', user.id, payload);
                return replyMessage;
            },
            followUp: async (payload) => {
                this.record('followUp', user.id, payload);
                return this.createMessage(channel?.id ?? 'reply', payload);
            },
            fetchReply: async () => replyMessage,
        };
        return interaction;
    }

    command(commandName, { user, subcommand = null, options = {} }) {
        return this.interaction('command', { user, commandName, subcommand, options });
    }

    button(customId, { user, message = { embeds: [] } }) {
        return this.interaction('button', { user, customId, message });
    }

    stringSelect(customId, { user, values }) {
        return this.interaction('stringSelect', { user, customId, values });
    }

    userSelect(customId, { user, users }) {
        return this.interaction('userSelect', { user, customId, users });
    }
}
