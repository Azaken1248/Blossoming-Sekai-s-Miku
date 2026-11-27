import { MINUTE } from '../../Utils/domain/durations.ts';
import { assignTo, type AssignOptions } from '../commands/assignTo.ts';
import { logAction } from '../notifier.ts';
import type { DirectUser, PeoplePickInteraction } from '../ports.ts';
import {
    ASSIGN_REFUSALS,
    BULK_EXPIRED,
    BULK_NONE_PICKED,
    BULK_NOT_YOURS,
    type BulkFailure,
    bulkAssignedDm,
    bulkAssignedLog,
    bulkResult,
} from '../views/assignment.ts';
import { refusalFor } from '../views/refusals.ts';

export const BULK_ASSIGN_PREFIX = 'bulkassign_select_';

interface Pending {
    readonly authorId: string;
    readonly request: AssignOptions;
}

export const bulkAssignCache = new Map<string, Pending>();

export const rememberBulkAssign = (authorId: string, request: AssignOptions): string => {
    const operationId = Date.now().toString() + Math.floor(Math.random() * 1000).toString();
    bulkAssignCache.set(operationId, { authorId, request });
    setTimeout(() => {
        bulkAssignCache.delete(operationId);
    }, 15 * MINUTE);
    return operationId;
};

const assignEach = async (interaction: PeoplePickInteraction, request: AssignOptions) => {
    const assigned: DirectUser[] = [];
    const failures: BulkFailure[] = [];
    for (const [, user] of interaction.users) {
        try {
            await assignTo(interaction.guild, user, request);
            assigned.push(user);
            user.send(bulkAssignedDm(request)).catch(() => {});
        } catch (error) {
            failures.push({ userId: user.id, reason: refusalFor(error, ASSIGN_REFUSALS).content });
        }
    }
    return { assigned, failures };
};

const pickRefusal = (interaction: PeoplePickInteraction, pending: Pending) => {
    if (interaction.user.id !== pending.authorId) return BULK_NOT_YOURS;
    return interaction.users.size === 0 ? BULK_NONE_PICKED : null;
};

export const handleBulkAssignPick = async (interaction: PeoplePickInteraction) => {
    await interaction.deferUpdate();
    const operationId = interaction.customId.replace(BULK_ASSIGN_PREFIX, '');
    const pending = bulkAssignCache.get(operationId);
    if (!pending) return interaction.editReply(BULK_EXPIRED);
    const refusal = pickRefusal(interaction, pending);
    if (refusal) return interaction.editReply(refusal);

    const { assigned, failures } = await assignEach(interaction, pending.request);
    bulkAssignCache.delete(operationId);
    if (assigned.length > 0) {
        const ids = assigned.map(({ id }) => id);
        await logAction(interaction.guild, bulkAssignedLog(pending.request, ids), interaction.user);
    }
    await interaction.editReply(bulkResult(assigned.length, failures));
    return undefined;
};
