import config from '../../config.js';
import { approvalService, hiatusService } from '../../Services/index.ts';
import { isManagerOrOwner as canManage, isOwner as canOwn } from '../../Utils/DiscordUtils/access.js';
import { taskTitle } from '../../Utils/domain/assignments.ts';
import { DAY } from '../../Utils/domain/durations.ts';
import { DomainError } from '../../Utils/domain/errors.ts';
import { ConfigError } from '../../Utils/domain/extensions.ts';
import type { Task } from '../../Utils/domain/model.ts';
import { formatStrikes } from '../../Utils/domain/strikes.ts';
import { channelOf } from '../notifier.ts';
import type { GuildPort, MemberPort, Payload, UserPort } from '../ports.ts';

export interface ButtonInteraction {
    readonly customId: string;
    readonly user: UserPort;
    readonly guild: GuildPort;
    readonly message: { readonly embeds: readonly { readonly footer?: { readonly text?: string } | null }[] };
    readonly replied: boolean;
    readonly deferred: boolean;
    deferUpdate(): Promise<unknown>;
    editReply(payload: Payload): Promise<unknown>;
    reply(payload: Payload): Promise<unknown>;
}

interface Staff {
    readonly isOwner: boolean;
    readonly isManagerOrOwner: boolean;
}

type Refusal = Record<string, unknown> | undefined;

const OWNED_BUTTON_ACTIONS = new Set(['submit', 'extension', 'hiatus']);

const EXTENSION_REFUSALS: Partial<Record<string, string>> = {
    ALREADY_EXTENDED: '⚠️ That task has already used all of its extensions.',
    TASK_NOT_FOUND: '⚠️ That task no longer exists.',
    TASK_CHANGED: '⚠️ That task has already been resolved.',
};

export const ownsButton = (customId: string): boolean => {
    const [action = ''] = customId.split('_');
    return OWNED_BUTTON_ACTIONS.has(action);
};

const closed = (interaction: ButtonInteraction, content: string) => ({
    content,
    embeds: interaction.message.embeds,
    components: [],
});

const notifyChannel = (interaction: ButtonInteraction, channelId: string | null | undefined, content: string) => {
    if (!channelId) return;
    const channel = channelOf(interaction.guild, channelId);
    if (channel) void channel.send(content);
};

const notifyLog = (interaction: ButtonInteraction, content: string) => {
    notifyChannel(interaction, config.LOG_CHANNEL_ID, content);
};

const approveSubmission = async (interaction: ButtonInteraction, task: Task, staff: Staff): Promise<Refusal> => {
    if (!staff.isOwner) {
        console.log(`[BUTTON]   ❌ Permission denied: Only owners can approve submissions`);
        return { content: 'Thanks for checking, but only owners can approve submissions! ♪' };
    }
    console.log(`[BUTTON]   Approving submission...`);
    let strikes;
    try {
        ({ strikes } = await approvalService.approveSubmission(task));
    } catch (error) {
        if (!(error instanceof DomainError && error.code === 'TASK_RESOLVED')) throw error;
        console.log(`[BUTTON]   ⚠️ Task ${task.id} was already resolved; ignoring duplicate approval`);
        return closed(interaction, `⚠️ That task has already been resolved.`);
    }
    console.log(`[BUTTON]   Strike removed. New count: ${formatStrikes(strikes)}`);
    await interaction.editReply(closed(interaction, `✅ Submission approved by <@${interaction.user.id}>`));
    notifyChannel(
        interaction,
        task.submissionChannelId,
        `✨ Congratulations <@${task.discordUserId}>! Your submission for **${taskTitle(task)}** has been approved! Amazing work~ ♪`,
    );
    notifyLog(
        interaction,
        `✅ **${taskTitle(task)}** completed by <@${task.discordUserId}>! Amazing work~ Strike removed. Current: ${formatStrikes(strikes)} ♪`,
    );
    console.log(`[BUTTON]   ✅ Submission approved successfully`);
    return undefined;
};

const extensionRefusal = (interaction: ButtonInteraction, error: unknown): Refusal => {
    if (error instanceof ConfigError) {
        console.error(`[BUTTON]   ❌ ${error.message}`);
        return closed(interaction, `⚠️ Configuration error: ${error.message}. Please contact an admin.`);
    }
    const code = error instanceof DomainError ? (error as DomainError).code : undefined;
    const reason = code === undefined ? undefined : EXTENSION_REFUSALS[code];
    if (!reason) throw error;
    console.log(`[BUTTON]   ⚠️ Extension refused: ${String(code)}`);
    return closed(interaction, reason);
};

const approveExtension = async (interaction: ButtonInteraction, task: Task, staff: Staff): Promise<Refusal> => {
    if (!staff.isManagerOrOwner) {
        console.log(`[BUTTON]   ❌ Permission denied: Only managers/owners can approve extensions`);
        return { content: 'Extension approvals are handled by managers and owners! Thanks for checking though~ ♪' };
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
    await interaction.editReply(closed(interaction, `✅ Extension approved by <@${interaction.user.id}>`));
    notifyChannel(
        interaction,
        task.submissionChannelId,
        `✨ Good news <@${task.discordUserId}>! Your extension request for **${taskTitle(task)}** has been approved! New deadline: <t:${ts}:F> ♪`,
    );
    notifyLog(
        interaction,
        `⏰ Extension granted for <@${task.discordUserId}> - **${taskTitle(task)}**! New deadline: <t:${ts}:F> ♪`,
    );
    console.log(`[BUTTON]   ✅ Extension approved successfully`);
    return undefined;
};

const denyTask = async (interaction: ButtonInteraction, action: string, task: Task, staff: Staff): Promise<Refusal> => {
    if (action === 'submit' && !staff.isOwner) {
        console.log(`[BUTTON]   ❌ Permission denied: Only owners can deny submissions`);
        return { content: 'Thanks for checking, but only owners can deny submissions! ♪' };
    }
    if (action === 'extension' && !staff.isManagerOrOwner) {
        console.log(`[BUTTON]   ❌ Permission denied: Only managers/owners can deny extensions`);
        return { content: 'Extension decisions are handled by managers and owners! Thanks for checking though~ ♪' };
    }
    console.log(`[BUTTON]   Denying ${action}...`);
    const label = action === 'submit' ? 'Submission' : 'Extension';
    await interaction.editReply(closed(interaction, `❌ ${label} denied by <@${interaction.user.id}>`));
    const actionText = action === 'submit' ? 'submission' : 'extension request';
    notifyChannel(
        interaction,
        task.submissionChannelId,
        `<@${task.discordUserId}> Your ${actionText} for **${taskTitle(task)}** was not approved. Please check with staff for feedback! 💖`,
    );
    console.log(`[BUTTON]   ✅ ${action} denied successfully`);
    return undefined;
};

const decideTask = async (interaction: ButtonInteraction, [action = '', type, taskId]: string[], staff: Staff) => {
    const task = taskId === undefined ? null : await approvalService.find(taskId);
    if (!task) {
        console.log(`[BUTTON]   ❌ Task not found: ${String(taskId)}`);
        return { content: '❌ Task not found.' };
    }
    console.log(`[BUTTON]   Task found: "${taskTitle(task)}" for user ${task.discordUserId}`);
    if (type === 'approve') {
        return action === 'submit'
            ? approveSubmission(interaction, task, staff)
            : approveExtension(interaction, task, staff);
    }
    return type === 'deny' ? denyTask(interaction, action, task, staff) : undefined;
};

const approveHiatus = async (interaction: ButtonInteraction, userId: string, channelId: string | undefined) => {
    console.log(`[BUTTON]   Approving hiatus...`);
    const { pausedCount } = await hiatusService.start(userId);
    console.log(`[BUTTON]   Found ${String(pausedCount)} pending tasks to pause`);
    console.log(`[BUTTON]   Paused all deadlines`);
    await interaction.editReply(closed(interaction, `✅ Hiatus approved by <@${interaction.user.id}>`));
    notifyChannel(
        interaction,
        channelId,
        `🌸 <@${userId}> Your hiatus request has been approved! All your tasks are paused. Take care and come back when you're ready~ ♪`,
    );
    notifyLog(
        interaction,
        `🏖️ Hiatus approved for <@${userId}>. All ${String(pausedCount)} pending task(s) paused. Take the time you need!`,
    );
    console.log(`[BUTTON]   ✅ Hiatus approved successfully with ${String(pausedCount)} tasks paused`);
};

const denyHiatus = async (interaction: ButtonInteraction, userId: string, channelId: string | undefined) => {
    console.log(`[BUTTON]   Denying hiatus...`);
    await interaction.editReply(closed(interaction, `❌ Hiatus denied by <@${interaction.user.id}>`));
    notifyChannel(
        interaction,
        channelId,
        `<@${userId}> Your hiatus request was not approved. Please reach out to staff if you have questions! 💖`,
    );
    console.log(`[BUTTON]   ✅ Hiatus denied successfully`);
};

const decideHiatus = async (interaction: ButtonInteraction, [, type, userId = '']: string[], staff: Staff) => {
    const channelId = interaction.message.embeds[0]?.footer?.text?.match(/Channel: (\d+)/)?.[1];
    console.log(`[BUTTON]   Processing hiatus ${String(type)} for user ${userId}`);
    if (!staff.isManagerOrOwner) {
        console.log(`[BUTTON]   ❌ Permission denied: Only managers/owners can handle hiatus requests`);
        return {
            content:
                'Hiatus requests are handled by managers and owners! Thanks for looking out for everyone though~ ♪',
        };
    }
    if (type === 'approve') await approveHiatus(interaction, userId, channelId);
    else if (type === 'deny') await denyHiatus(interaction, userId, channelId);
    return undefined;
};

const decide = async (interaction: ButtonInteraction, parts: string[]): Promise<Refusal> => {
    await interaction.deferUpdate();
    console.log(`[BUTTON]   Interaction deferred`);
    const member: MemberPort = await interaction.guild.members.fetch(interaction.user.id);
    const staff = { isOwner: canOwn(member), isManagerOrOwner: canManage(member) };
    const [action, type, taskId] = parts;
    console.log(`[BUTTON]   Action: ${String(action)} | Type: ${String(type)} | Task ID: ${String(taskId)}`);
    return action === 'hiatus' ? decideHiatus(interaction, parts, staff) : decideTask(interaction, parts, staff);
};

export const handleApprovalButton = async (interaction: ButtonInteraction): Promise<unknown> => {
    console.log(`[BUTTON] ${interaction.customId} by ${interaction.user.tag} (${interaction.user.id})`);
    let refusal: Refusal;
    try {
        refusal = await decide(interaction, interaction.customId.split('_'));
    } catch (e) {
        console.error(`[BUTTON] ❌ Error processing ${interaction.customId}:`, e);
        if (!interaction.replied && !interaction.deferred) {
            void interaction.reply({ content: '❌ Error processing request.', flags: 64 });
        } else if (interaction.deferred) {
            void interaction.editReply({ content: '❌ Error processing request.' });
        }
        return undefined;
    }
    return refusal ? interaction.editReply(refusal) : undefined;
};
