export interface Actor {
    readonly id: string;
    readonly roleIds: readonly string[];
}

export type PermissionLevel = 'anyone' | 'selfOrOwner' | 'managerOrOwner' | 'owner';

export interface CommandPolicy {
    readonly permission: PermissionLevel;
    readonly requiresOnboarding?: boolean;
}

export interface AccessConfig {
    readonly OWNER_ROLE_ID: string;
    readonly MANAGER_ROLE_IDS: readonly string[];
    readonly ADMIN_USER_IDS: readonly string[];
}

export interface PermissionContext {
    readonly actorId?: string | undefined;
    readonly targetId?: string | undefined;
}

export const COMMAND_POLICY = {
    assign: { permission: 'owner' },
    bulkassign: { permission: 'owner' },
    strike: { permission: 'managerOrOwner' },
    onboard: { permission: 'owner' },
    deboard: { permission: 'owner' },
    removetask: { permission: 'managerOrOwner' },
    submit: { permission: 'selfOrOwner', requiresOnboarding: true },
    extension: { permission: 'selfOrOwner', requiresOnboarding: true },
    hiatus: { permission: 'selfOrOwner', requiresOnboarding: true },
    endhiatus: { permission: 'selfOrOwner', requiresOnboarding: true },
    profile: { permission: 'anyone' },
    card: { permission: 'anyone' },
    tasks: { permission: 'anyone' },
    history: { permission: 'anyone' },
    checkfree: { permission: 'anyone' },
    help: { permission: 'anyone' },
    ping: { permission: 'anyone' },
    uptime: { permission: 'anyone' },
} as const satisfies Record<string, CommandPolicy>;

export type CommandName = keyof typeof COMMAND_POLICY;

export const APPROVAL_POLICY = {
    submit: { permission: 'owner' },
    extension: { permission: 'managerOrOwner' },
    hiatus: { permission: 'managerOrOwner' },
} as const satisfies Record<string, { readonly permission: PermissionLevel }>;

export type ApprovalAction = keyof typeof APPROVAL_POLICY;

export const isCommandName = (name: string): name is CommandName => Object.hasOwn(COMMAND_POLICY, name);

export const isApprovalAction = (name: string): name is ApprovalAction => Object.hasOwn(APPROVAL_POLICY, name);

export const createPermissions = (access: AccessConfig) => {
    const isAdmin = (userId: string): boolean => access.ADMIN_USER_IDS.includes(userId);

    const isOwner = (actor: Actor | null): boolean =>
        actor !== null && (isAdmin(actor.id) || actor.roleIds.includes(access.OWNER_ROLE_ID));

    const isManager = (actor: Actor | null): boolean =>
        actor !== null &&
        (isAdmin(actor.id) || access.MANAGER_ROLE_IDS.some((roleId) => actor.roleIds.includes(roleId)));

    const isManagerOrOwner = (actor: Actor | null): boolean => isOwner(actor) || isManager(actor);

    const hasPermission = (
        actor: Actor | null,
        level: PermissionLevel,
        { actorId, targetId }: PermissionContext = {},
    ): boolean => {
        switch (level) {
            case 'anyone':
                return true;
            case 'selfOrOwner':
                return (targetId !== undefined && targetId === actorId) || isOwner(actor);
            case 'managerOrOwner':
                return isManagerOrOwner(actor);
            case 'owner':
                return isOwner(actor);
            default:
                return false;
        }
    };

    return { isAdmin, isOwner, isManager, isManagerOrOwner, hasPermission };
};

export type Permissions = ReturnType<typeof createPermissions>;
