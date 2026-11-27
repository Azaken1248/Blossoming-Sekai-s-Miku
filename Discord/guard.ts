import config from '../config.js';
import { memberService } from '../Services/index.ts';
import {
    APPROVAL_POLICY,
    COMMAND_POLICY,
    createPermissions,
    type Actor,
    type ApprovalAction,
    type CommandName,
    type CommandPolicy,
    type PermissionLevel,
} from '../Utils/permissions.ts';
import type { Asker, MemberPort } from './ports.ts';
import { commandDenial, notOnboarded, type Reply } from './views/permissions.ts';

const permissions = createPermissions(config);

export const roleIdsOf = (member: MemberPort): string[] => [...member.roles.cache.keys()];

const actorOf = async ({ user, guild }: Asker): Promise<Actor> => {
    const member = await guild.members.fetch(user.id);
    return { id: member.id, roleIds: roleIdsOf(member) };
};

const permits = async (asker: Asker, level: PermissionLevel, targetId: string): Promise<boolean> =>
    permissions.hasPermission(await actorOf(asker), level, { actorId: asker.user.id, targetId });

export const guardCommand = async (
    asker: Asker,
    command: CommandName,
    targetId: string = asker.user.id,
): Promise<Reply | null> => {
    const policy: CommandPolicy = COMMAND_POLICY[command];
    if (policy.permission !== 'anyone' && !(await permits(asker, policy.permission, targetId))) {
        return commandDenial(command);
    }
    if (policy.requiresOnboarding && !(await memberService.isOnboarded(targetId))) {
        return notOnboarded(command, targetId === asker.user.id);
    }
    return null;
};

export const guardTaskPick = async (asker: Asker, targetId: string): Promise<Reply | null> =>
    (await permits(asker, COMMAND_POLICY.submit.permission, targetId)) ? null : commandDenial('submit');

export const approvalAccess = async (asker: Asker): Promise<(action: ApprovalAction) => boolean> => {
    const actor = await actorOf(asker);
    return (action) => permissions.hasPermission(actor, APPROVAL_POLICY[action].permission);
};
