import { assignmentService } from '../../Services/index.ts';
import { DomainError } from '../../Utils/domain/errors.ts';
import type { Task } from '../../Utils/domain/model.ts';
import { roleIdsOf } from '../guard.ts';
import type { GuildPort, UserPort } from '../ports.ts';

export interface AssignOptions {
    readonly taskType: string;
    readonly roleName: string;
    readonly taskName: string;
    readonly description: string;
    readonly durationDays: number | null;
    readonly extensionDays: number | null;
}

export const assignTo = async (guild: GuildPort, target: UserPort, request: AssignOptions): Promise<Task> => {
    const member = await guild.members.fetch(target.id).catch(() => null);
    if (!member) throw new DomainError('MEMBER_NOT_IN_GUILD');
    return assignmentService.assign({
        ...request,
        target: { discordId: target.id, username: target.username },
        roleIds: roleIdsOf(member),
    });
};
