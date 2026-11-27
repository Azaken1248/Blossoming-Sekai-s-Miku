import { approvalService, hiatusService } from '../../Services/index.ts';
import { taskTitle } from '../../Utils/domain/assignments.ts';
import { DAY } from '../../Utils/domain/durations.ts';
import { DomainError } from '../../Utils/domain/errors.ts';
import { ConfigError } from '../../Utils/domain/extensions.ts';
import type { Task } from '../../Utils/domain/model.ts';
import { formatStrikes } from '../../Utils/domain/strikes.ts';
import { type ApprovalAction, isApprovalAction } from '../../Utils/permissions.ts';
import { approvalAccess } from '../guard.ts';
import { notify, notifyLog } from '../notifier.ts';
import type { ButtonInteraction } from '../ports.ts';
import * as view from '../views/approvals.ts';
import { COMPONENT_FAILED } from '../views/errors.ts';
import { requestChannelOf } from '../views/hiatus.ts';
import { HIATUS_DECISION_DENIAL, taskDecisionDenial } from '../views/permissions.ts';

type Refusal = Record<string, unknown> | undefined;
type Allows = (action: ApprovalAction) => boolean;

export const ownsButton = (customId: string): boolean => {
    const [action = ''] = customId.split('_');
    return isApprovalAction(action);
};

const closeWith = (interaction: ButtonInteraction, outcome: string) =>
    interaction.editReply(view.closed(interaction.message, view.decidedBy(outcome, interaction.user.id)));

const approveSubmission = async (interaction: ButtonInteraction, task: Task, allows: Allows): Promise<Refusal> => {
    if (!allows('submit')) {
        console.log(`[BUTTON]   ❌ Permission denied: Only owners can approve submissions`);
        return taskDecisionDenial('submit', 'approve');
    }
    console.log(`[BUTTON]   Approving submission...`);
    let strikes;
    try {
        ({ strikes } = await approvalService.approveSubmission(task));
    } catch (error) {
        if (!(error instanceof DomainError && error.code === 'TASK_RESOLVED')) throw error;
        console.log(`[BUTTON]   ⚠️ Task ${task.id} was already resolved; ignoring duplicate approval`);
        return view.closed(interaction.message, view.ALREADY_RESOLVED);
    }
    console.log(`[BUTTON]   Strike removed. New count: ${formatStrikes(strikes)}`);
    await closeWith(interaction, view.SUBMISSION_APPROVED);
    notify(interaction.guild, task.submissionChannelId, view.submissionApproved(task));
    notifyLog(interaction.guild, view.submissionApprovedLog(task, strikes));
    console.log(`[BUTTON]   ✅ Submission approved successfully`);
    return undefined;
};

const extensionRefusal = (interaction: ButtonInteraction, error: unknown): Refusal => {
    if (error instanceof ConfigError) {
        console.error(`[BUTTON]   ❌ ${error.message}`);
        return view.closed(interaction.message, view.configProblem(error.message));
    }
    const code = error instanceof DomainError ? (error as DomainError).code : undefined;
    const reason = code === undefined ? undefined : view.EXTENSION_REFUSALS[code];
    if (!reason) throw error;
    console.log(`[BUTTON]   ⚠️ Extension refused: ${String(code)}`);
    return view.closed(interaction.message, reason);
};

const approveExtension = async (interaction: ButtonInteraction, task: Task, allows: Allows): Promise<Refusal> => {
    if (!allows('extension')) {
        console.log(`[BUTTON]   ❌ Permission denied: Only managers/owners can approve extensions`);
        return taskDecisionDenial('extension', 'approve');
    }
    console.log(`[BUTTON]   Approving extension...`);
    let approved;
    try {
        approved = await approvalService.approveExtension(task);
    } catch (error) {
        return extensionRefusal(interaction, error);
    }
    const ts = String(Math.round(approved.deadline.getTime() / 1000));
    console.log(`[BUTTON]   Extension duration: ${String(approved.extensionMs / DAY)} days`);
    console.log(`[BUTTON]   New deadline: ${approved.deadline.toISOString()}`);
    await closeWith(interaction, view.EXTENSION_APPROVED);
    notify(interaction.guild, task.submissionChannelId, view.extensionApproved(task, ts));
    notifyLog(interaction.guild, view.extensionApprovedLog(task, ts));
    console.log(`[BUTTON]   ✅ Extension approved successfully`);
    return undefined;
};

const denyTask = async (
    interaction: ButtonInteraction,
    action: 'submit' | 'extension',
    task: Task,
    allows: Allows,
): Promise<Refusal> => {
    if (!allows(action)) {
        console.log(
            action === 'submit'
                ? `[BUTTON]   ❌ Permission denied: Only owners can deny submissions`
                : `[BUTTON]   ❌ Permission denied: Only managers/owners can deny extensions`,
        );
        return taskDecisionDenial(action, 'deny');
    }
    console.log(`[BUTTON]   Denying ${action}...`);
    await closeWith(interaction, view.deniedOutcome(action));
    notify(interaction.guild, task.submissionChannelId, view.taskDenied(action, task));
    console.log(`[BUTTON]   ✅ ${action} denied successfully`);
    return undefined;
};

const decideTask = async (interaction: ButtonInteraction, [action, type, taskId]: string[], allows: Allows) => {
    const task = taskId === undefined ? null : await approvalService.find(taskId);
    if (!task) {
        console.log(`[BUTTON]   ❌ Task not found: ${String(taskId)}`);
        return view.TASK_NOT_FOUND;
    }
    console.log(`[BUTTON]   Task found: "${taskTitle(task)}" for user ${task.discordUserId}`);
    const taskAction = action === 'submit' ? 'submit' : 'extension';
    if (type === 'approve') {
        return taskAction === 'submit'
            ? approveSubmission(interaction, task, allows)
            : approveExtension(interaction, task, allows);
    }
    return type === 'deny' ? denyTask(interaction, taskAction, task, allows) : undefined;
};

const approveHiatus = async (interaction: ButtonInteraction, userId: string, channelId: string | undefined) => {
    console.log(`[BUTTON]   Approving hiatus...`);
    const { pausedCount } = await hiatusService.start(userId);
    console.log(`[BUTTON]   Found ${String(pausedCount)} pending tasks to pause`);
    console.log(`[BUTTON]   Paused all deadlines`);
    await closeWith(interaction, view.HIATUS_APPROVED);
    notify(interaction.guild, channelId, view.hiatusApproved(userId));
    notifyLog(interaction.guild, view.hiatusApprovedLog(userId, pausedCount));
    console.log(`[BUTTON]   ✅ Hiatus approved successfully with ${String(pausedCount)} tasks paused`);
};

const denyHiatus = async (interaction: ButtonInteraction, userId: string, channelId: string | undefined) => {
    console.log(`[BUTTON]   Denying hiatus...`);
    await closeWith(interaction, view.HIATUS_DENIED);
    notify(interaction.guild, channelId, view.hiatusDenied(userId));
    console.log(`[BUTTON]   ✅ Hiatus denied successfully`);
};

const decideHiatus = async (interaction: ButtonInteraction, [, type, userId = '']: string[], allows: Allows) => {
    const channelId = requestChannelOf(interaction.message.embeds[0]?.footer?.text);
    console.log(`[BUTTON]   Processing hiatus ${String(type)} for user ${userId}`);
    if (!allows('hiatus')) {
        console.log(`[BUTTON]   ❌ Permission denied: Only managers/owners can handle hiatus requests`);
        return HIATUS_DECISION_DENIAL;
    }
    if (type === 'approve') await approveHiatus(interaction, userId, channelId);
    else if (type === 'deny') await denyHiatus(interaction, userId, channelId);
    return undefined;
};

const decide = async (interaction: ButtonInteraction, parts: string[]): Promise<Refusal> => {
    await interaction.deferUpdate();
    console.log(`[BUTTON]   Interaction deferred`);
    const allows = await approvalAccess(interaction);
    const [action, type, taskId] = parts;
    console.log(`[BUTTON]   Action: ${String(action)} | Type: ${String(type)} | Task ID: ${String(taskId)}`);
    return action === 'hiatus' ? decideHiatus(interaction, parts, allows) : decideTask(interaction, parts, allows);
};

export const handleApprovalButton = async (interaction: ButtonInteraction): Promise<unknown> => {
    console.log(`[BUTTON] ${interaction.customId} by ${interaction.user.tag} (${interaction.user.id})`);
    let refusal: Refusal;
    try {
        refusal = await decide(interaction, interaction.customId.split('_'));
    } catch (e) {
        console.error(`[BUTTON] ❌ Error processing ${interaction.customId}:`, e);
        if (!interaction.replied && !interaction.deferred) {
            void interaction.reply({ ...COMPONENT_FAILED, flags: 64 });
        } else if (interaction.deferred) {
            void interaction.editReply(COMPONENT_FAILED);
        }
        return undefined;
    }
    return refusal ? interaction.editReply(refusal) : undefined;
};
