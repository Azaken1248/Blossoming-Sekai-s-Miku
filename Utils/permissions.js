import config from '../config.js';

/**
 * Single source of truth for "who is allowed to do what".
 *
 * Every command handler consults this module, so a permission is enforced in
 * one place.
 */

export const isAdmin = (userId) => config.ADMIN_USER_IDS.includes(userId);

export const isOwner = (member) =>
    Boolean(member) && (isAdmin(member.id) || member.roles.cache.has(config.OWNER_ROLE_ID));

export const isManager = (member) =>
    Boolean(member) && (isAdmin(member.id) || config.MANAGER_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId)));

export const isManagerOrOwner = (member) => isOwner(member) || isManager(member);

/**
 * Evaluate a permission level against a guild member.
 *
 * @param {import('discord.js').GuildMember|null} member - the member invoking the command
 * @param {'anyone'|'selfOrOwner'|'managerOrOwner'|'owner'} level
 * @param {{ actorId?: string, targetId?: string }} [context]
 *        For 'selfOrOwner': the command is allowed when the target is the actor
 *        themselves, or when the actor is an owner acting on someone else.
 */
export const hasPermission = (member, level, { actorId, targetId } = {}) => {
    switch (level) {
        case 'anyone':
            return true;
        case 'selfOrOwner':
            return (targetId !== undefined && targetId === actorId) || isOwner(member);
        case 'managerOrOwner':
            return isManagerOrOwner(member);
        case 'owner':
            return isOwner(member);
        default:
            // Unknown level: deny. A typo in the policy table must never grant access.
            return false;
    }
};

/**
 * Command policy. `permission` is the role requirement; `requiresOnboarding`
 * means the *target* must have an active (non-deboarded) profile.
 *
 * `denial` preserves the existing user-facing wording so behaviour is unchanged.
 */
export const COMMAND_POLICY = {
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

export const NOT_ONBOARDED_MESSAGE = 'Looks like this user needs to be onboarded first! Ask an owner to help~ ♪';
export const UNKNOWN_COMMAND_MESSAGE = "❔ I don't recognise that command. Try `/help` to see what I can do! ♪";

/**
 * Check a command against the policy table.
 *
 * Returns `{ allowed: true }` or `{ allowed: false, reason }` where `reason` is
 * the message to show the user. Commands absent from the table are denied.
 */
export const checkCommandPermission = (commandName, member, { actorId, targetId } = {}) => {
    const policy = COMMAND_POLICY[commandName];
    if (!policy) {
        return { allowed: false, reason: UNKNOWN_COMMAND_MESSAGE };
    }
    if (!hasPermission(member, policy.permission, { actorId, targetId })) {
        return { allowed: false, reason: policy.denial ?? "You don't have permission to do that." };
    }
    return { allowed: true, policy };
};

/** Button interactions carry their own approval requirements. */
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
