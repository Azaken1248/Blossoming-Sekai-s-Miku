export interface Actor {
    readonly id: string;
    readonly roleIds: readonly string[];
}

export type PermissionLevel = 'anyone' | 'selfOrOwner' | 'managerOrOwner' | 'owner';

export interface CommandPolicy {
    readonly permission: PermissionLevel;
    readonly requiresOnboarding?: boolean;
    readonly denial?: string;
}

export interface AccessConfig {
    readonly OWNER_ROLE_ID: string;
    readonly MANAGER_ROLE_IDS: readonly string[];
    readonly ADMIN_USER_IDS: readonly string[];
}

export interface PermissionContext {
    readonly actorId?: string;
    readonly targetId?: string;
}

export type PermissionCheck =
    { readonly allowed: true; readonly policy: CommandPolicy } | { readonly allowed: false; readonly reason: string };

export const COMMAND_POLICY: Record<string, CommandPolicy> = {
    assign: {
        permission: 'owner',
        denial: 'Sorry, but only owners can assign tasks! If you need something assigned, reach out to them~ ♪',
    },
    bulkassign: {
        permission: 'owner',
        denial: 'Only owners can assign tasks! ♪',
    },
    strike: {
        permission: 'managerOrOwner',
        denial: "Strike management is handled by managers and owners! If there's an issue, please reach out to them~ ♪",
    },
    onboard: {
        permission: 'owner',
        denial: 'Only owners can onboard new users! If someone needs to join, ask an owner to help them get started~ ♪',
    },
    deboard: {
        permission: 'owner',
        denial: 'Only owners can deboard users. If someone needs to take a break, ask an owner to help~ ♪',
    },
    removetask: {
        permission: 'managerOrOwner',
        denial: 'Only managers and owners can remove tasks! If a task needs to be removed, ask an owner or manager~ ♪',
    },
    submit: {
        permission: 'selfOrOwner',
        requiresOnboarding: true,
        denial: 'I appreciate the help, but you can only submit your own tasks! ♪',
    },
    extension: {
        permission: 'selfOrOwner',
        requiresOnboarding: true,
        denial: 'You can only request extensions for your own tasks! If someone else needs help, they should ask directly~ ♪',
    },
    hiatus: {
        permission: 'selfOrOwner',
        requiresOnboarding: true,
        denial: 'Only owners can grant hiatus directly to other users! Normal users can request their own hiatus~ ♪',
    },
    endhiatus: {
        permission: 'selfOrOwner',
        requiresOnboarding: true,
        denial: 'You can only end your own hiatus! If someone else is ready to return, they should let us know themselves~ ♪',
    },
    profile: { permission: 'anyone' },
    card: { permission: 'anyone' },
    tasks: { permission: 'anyone' },
    history: { permission: 'anyone' },
    checkfree: { permission: 'anyone' },
    available: { permission: 'anyone' },
    help: { permission: 'anyone' },
    ping: { permission: 'anyone' },
    uptime: { permission: 'anyone' },
};

export const APPROVAL_POLICY = {
    submit: {
        permission: 'owner',
        approveDenial: 'Thanks for checking, but only owners can approve submissions! ♪',
        denyDenial: 'Thanks for checking, but only owners can deny submissions! ♪',
    },
    extension: {
        permission: 'managerOrOwner',
        approveDenial: 'Extension approvals are handled by managers and owners! Thanks for checking though~ ♪',
        denyDenial: 'Extension decisions are handled by managers and owners! Thanks for checking though~ ♪',
    },
    hiatus: {
        permission: 'managerOrOwner',
        approveDenial:
            'Hiatus requests are handled by managers and owners! Thanks for looking out for everyone though~ ♪',
        denyDenial: 'Hiatus requests are handled by managers and owners! Thanks for looking out for everyone though~ ♪',
    },
};

export const NOT_ONBOARDED_MESSAGE = 'Looks like this user needs to be onboarded first! Ask an owner to help~ ♪';
export const UNKNOWN_COMMAND_MESSAGE = "❔ I don't recognise that command. Try `/help` to see what I can do! ♪";

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

    const checkCommandPermission = (
        commandName: string,
        actor: Actor | null,
        context: PermissionContext = {},
    ): PermissionCheck => {
        const policy = Object.hasOwn(COMMAND_POLICY, commandName) ? COMMAND_POLICY[commandName] : undefined;
        if (!policy) return { allowed: false, reason: UNKNOWN_COMMAND_MESSAGE };
        if (!hasPermission(actor, policy.permission, context)) {
            return { allowed: false, reason: policy.denial ?? "You don't have permission to do that." };
        }
        return { allowed: true, policy };
    };

    return { isAdmin, isOwner, isManager, isManagerOrOwner, hasPermission, checkCommandPermission };
};

export type Permissions = ReturnType<typeof createPermissions>;
