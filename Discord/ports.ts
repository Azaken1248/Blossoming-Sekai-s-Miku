export type Payload = string | Record<string, unknown>;

export interface Sendable {
    send(payload: Payload): Promise<unknown>;
}

export interface MemberPort extends Sendable {
    readonly id: string;
    readonly roles: {
        readonly cache: { keys(): IterableIterator<string> };
        remove(roleIds: readonly string[]): Promise<unknown>;
    };
}

export interface GuildPort {
    readonly channels: { readonly cache: { get(id: string): Sendable | undefined } };
    readonly members: { fetch(id: string): Promise<MemberPort> };
}

export interface UserPort {
    readonly id: string;
    readonly tag: string;
    readonly username: string;
}

export interface AvatarUser extends UserPort {
    displayAvatarURL(options: { readonly dynamic: boolean; readonly size?: number }): string;
}

export interface DirectUser extends UserPort, Sendable {}

export interface Asker {
    readonly user: UserPort;
    readonly guild: GuildPort;
}

export interface PageClick {
    readonly customId: string;
    readonly user: UserPort;
    deferUpdate(): Promise<unknown>;
    editReply(payload: Payload): Promise<unknown>;
}

export interface Collector {
    on(event: 'collect', listener: (click: PageClick) => Promise<void>): unknown;
    on(event: 'end', listener: () => void): unknown;
}

export interface SentReply {
    readonly createdTimestamp: number;
    createMessageComponentCollector(options: {
        readonly time: number;
        readonly filter: (click: PageClick) => boolean;
    }): Collector;
    edit(payload: Payload): Promise<unknown>;
}

export interface CommandOptions {
    getUser(name: string, required: true): AvatarUser;
    getUser(name: string): AvatarUser | null;
    getString(name: string, required: true): string;
    getString(name: string): string | null;
    getInteger(name: string): number | null;
    getSubcommand(): string;
}

interface Replyable {
    readonly replied: boolean;
    readonly deferred: boolean;
    reply(payload: Payload): Promise<unknown>;
}

export interface CommandInteraction extends Asker, Replyable {
    readonly commandName: string;
    readonly user: AvatarUser;
    readonly channelId: string;
    readonly createdTimestamp: number;
    readonly client: { readonly uptime: number };
    readonly options: CommandOptions;
    deferReply(): Promise<unknown>;
    editReply(payload: Payload): Promise<SentReply>;
}

export interface ComponentInteraction extends Asker, Replyable {
    readonly customId: string;
    readonly channelId: string;
    deferUpdate(): Promise<unknown>;
    editReply(payload: Payload): Promise<unknown>;
}

export interface TaskPickInteraction extends ComponentInteraction {
    readonly values: readonly string[];
}

export interface PeoplePickInteraction extends ComponentInteraction {
    readonly users: ReadonlyMap<string, DirectUser>;
}

export interface ButtonInteraction extends ComponentInteraction {
    readonly message: { readonly embeds: readonly { readonly footer?: { readonly text?: string } | null }[] };
}
