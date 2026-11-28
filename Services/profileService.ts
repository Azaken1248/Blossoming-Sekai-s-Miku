import { pickRoles, tallyTasks, type TaskRole } from '../Utils/domain/profile.ts';

export interface GuildPerson {
    readonly displayName: string | null;
    readonly avatarUrl: string | null;
    readonly roleNames: readonly string[];
}

export interface DiscordAvatar {
    readonly avatarUrl: string | null;
}

export interface GuildLookup {
    readonly avatar: (discordId: string) => Promise<DiscordAvatar>;
    readonly everyone: () => Promise<ReadonlyMap<string, GuildPerson> | null>;
    readonly find: (discordId: string) => Promise<GuildPerson | null>;
}

export interface StoredMember {
    readonly discordId: string;
    readonly username?: string;
    readonly strikes?: number;
    readonly isOnHiatus?: boolean;
    readonly roles?: unknown;
    readonly [field: string]: unknown;
}

export interface ProfileRecords {
    readonly listUsers: (options: {
        readonly limit?: unknown;
        readonly search?: string | null | undefined;
    }) => Promise<StoredMember[]>;
    readonly summaryRecord: (discordId: string) => Promise<StoredMember | null>;
    readonly storedMember: (discordId: string) => Promise<StoredMember | null>;
    readonly profile: (discordId: string) => Promise<StoredMember | null>;
    readonly taskRoles: (discordId: string) => Promise<TaskRole[]>;
}

export interface DescriptionFacts {
    readonly username: string;
    readonly strikes: number;
    readonly isOnHiatus: boolean;
    readonly tasksCompleted: number;
    readonly topTaskRoles: readonly string[];
}

interface Dependencies {
    readonly records: ProfileRecords;
    readonly guild: GuildLookup;
    readonly roleName: (stored: string) => string | undefined;
    readonly describe: (facts: DescriptionFacts) => string;
}

const SUMMARY_TASK_ROLES = 3;
const CARD_TASK_ROLES = 2;

type RosterOptions = Parameters<ProfileRecords['listUsers']>[0];
type RoleNamer = (roles: unknown) => string[];

const nameOf = (member: StoredMember, person: GuildPerson | null) =>
    person?.displayName || member.username || 'Unknown User';

const namedRoles =
    (roleName: Dependencies['roleName']): RoleNamer =>
    (roles) =>
        (Array.isArray(roles) ? (roles as string[]) : []).flatMap((stored) => {
            const name = roleName(stored) || stored;
            return name && name !== '@everyone' ? [name] : [];
        });

const describer =
    (describe: Dependencies['describe']) =>
    (member: StoredMember, username: string, tasksCompleted: number, topTaskRoles: readonly string[]) =>
        describe({
            username,
            strikes: member.strikes || 0,
            isOnHiatus: Boolean(member.isOnHiatus),
            tasksCompleted,
            topTaskRoles,
        });

const lookUpWith =
    ({ records, guild }: Dependencies, storedRoles: RoleNamer) =>
    async (member: StoredMember, topRoles: number) => {
        const tasks = await records.taskRoles(member.discordId);
        const tally = tallyTasks(tasks, topRoles);
        const discord = await guild.avatar(member.discordId);
        const stored = storedRoles(member.roles);
        const person = await guild.find(member.discordId);
        return {
            tasks,
            tally,
            stored,
            person,
            actualRoles: pickRoles(person?.roleNames ?? [], stored, tally.topTaskRoles),
            username: nameOf(member, person),
            avatarUrl: person?.avatarUrl || discord.avatarUrl,
        };
    };

type LookUp = ReturnType<typeof lookUpWith>;
type Describer = ReturnType<typeof describer>;

const rosterWith =
    ({ records, guild }: Dependencies, storedRoles: RoleNamer) =>
    async (options: RosterOptions) => {
        const users = await records.listUsers(options);
        const everyone = await guild.everyone();
        if (!everyone) {
            return users.map((user) => ({
                ...user,
                storedRoles: storedRoles(user.roles),
                actualRoles: storedRoles(user.roles),
            }));
        }
        return users.flatMap((user) => {
            const person = everyone.get(user.discordId);
            if (!person) return [];
            const stored = storedRoles(user.roles);
            return [
                {
                    ...user,
                    username: nameOf(user, person),
                    avatarUrl: person.avatarUrl,
                    storedRoles: stored,
                    actualRoles: person.roleNames.length ? person.roleNames : stored,
                },
            ];
        });
    };

const summaryWith =
    (records: ProfileRecords, lookUp: LookUp, descriptionOf: Describer) => async (discordId: string) => {
        const member = await records.summaryRecord(discordId);
        if (!member) return null;
        const found = await lookUp(member, SUMMARY_TASK_ROLES);
        const { tasksCompleted } = found.tally;
        const topTaskRoles = found.tally.topTaskRoles.length
            ? found.tally.topTaskRoles
            : found.actualRoles.slice(0, SUMMARY_TASK_ROLES);
        return {
            ...member,
            username: found.username,
            avatarUrl: found.avatarUrl,
            storedRoles: found.stored,
            actualRoles: found.actualRoles,
            totalAssignments: found.tasks.length,
            tasksCompleted,
            topTaskRoles,
            mikuDescription: descriptionOf(member, found.username, tasksCompleted, topTaskRoles),
            isGuildMember: Boolean(found.person),
        };
    };

const cardWith = (records: ProfileRecords, lookUp: LookUp, descriptionOf: Describer) => async (discordId: string) => {
    const member = await records.storedMember(discordId);
    if (!member) return null;
    const { tally, actualRoles, username, avatarUrl } = await lookUp(member, CARD_TASK_ROLES);
    return {
        member,
        username,
        avatarUrl,
        serverRoles: actualRoles.slice(0, CARD_TASK_ROLES),
        workRoles: tally.topTaskRoles,
        tasksCompleted: tally.tasksCompleted,
        description: descriptionOf(member, username, tally.tasksCompleted, tally.topTaskRoles),
    };
};

export const createProfileService = (dependencies: Dependencies) => {
    const { records } = dependencies;
    const storedRoles = namedRoles(dependencies.roleName);
    const lookUp = lookUpWith(dependencies, storedRoles);
    const descriptionOf = describer(dependencies.describe);
    return {
        record: async (discordId: string) => records.profile(discordId),
        storedMember: async (discordId: string) => records.storedMember(discordId),
        roster: rosterWith(dependencies, storedRoles),
        summary: summaryWith(records, lookUp, descriptionOf),
        card: cardWith(records, lookUp, descriptionOf),
    };
};

export type ProfileService = ReturnType<typeof createProfileService>;
