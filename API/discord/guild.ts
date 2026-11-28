import type { DiscordAvatar, GuildPerson, GuildLookup } from '../../Services/profileService.ts';
import {
    avatarUrl,
    discordRest,
    readDiscordAuth,
    type DiscordAuth,
    type DiscordRest,
    type GuildMember,
} from './rest.ts';

const EVERYONE = '@everyone';

const roleNamesOf = (member: GuildMember, roles: ReadonlyMap<string, string>): string[] =>
    (member.roles ?? []).flatMap((roleId) => {
        const name = roles.get(roleId);
        return name && name !== EVERYONE ? [name] : [];
    });

const personOf = (member: GuildMember, roles: ReadonlyMap<string, string>): GuildPerson => ({
    displayName: member.user?.global_name || member.user?.username || null,
    avatarUrl: avatarUrl(member.user?.id, member.user?.avatar),
    roleNames: roleNamesOf(member, roles),
});

export const createGuildLookup = (rest: DiscordRest, readAuth: () => DiscordAuth): GuildLookup => {
    const avatar = async (discordId: string, botToken: string, guildId: string | undefined): Promise<DiscordAvatar> => {
        const [user, member] = await Promise.all([
            rest.user(discordId, botToken),
            guildId ? rest.member(guildId, discordId, botToken) : Promise.resolve(null),
        ]);
        if (guildId && member?.roles?.length) await rest.roleNames(guildId, botToken);
        return { avatarUrl: avatarUrl(discordId, user?.avatar) };
    };

    return {
        avatar: async (discordId) => {
            const { botToken, guildId } = readAuth();
            if (!botToken) return { avatarUrl: null };
            try {
                return await avatar(discordId, botToken, guildId);
            } catch {
                return { avatarUrl: null };
            }
        },

        everyone: async () => {
            const { botToken, guildId } = readAuth();
            if (!botToken || !guildId) return null;
            const [roles, members] = await Promise.all([
                rest.roleNames(guildId, botToken),
                rest.members(guildId, botToken),
            ]);
            return new Map([...members].map(([id, member]) => [id, personOf(member, roles)]));
        },

        find: async (discordId) => {
            const { botToken, guildId } = readAuth();
            if (!botToken || !guildId) return null;
            const [members, roles] = await Promise.all([
                rest.members(guildId, botToken),
                rest.roleNames(guildId, botToken),
            ]);
            const member = members.get(discordId);
            return member ? personOf(member, roles) : null;
        },
    };
};

export const guildLookup = createGuildLookup(discordRest, readDiscordAuth);
