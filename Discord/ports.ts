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
