import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { taskTitle } from '../../Utils/domain/assignments.ts';
import type { Member, Task } from '../../Utils/domain/model.ts';
import { unix } from './format.ts';

export interface HistoryFilterView {
    readonly targetUser: { readonly username: string } | null;
    readonly taskName: string | null;
    readonly status: string | null;
    readonly roleName: string | null;
}

export interface HistoryPageView {
    readonly tasks: readonly (Task & { readonly member: Member | null })[];
    readonly page: number;
    readonly totalPages: number;
    readonly total: number;
}

export const NO_HISTORY = { content: 'No tasks found matching the criteria.', components: [] };

const STATUS_ICONS: Partial<Record<string, string>> = {
    COMPLETED: '✅',
    PENDING: '🗒️',
    LATE: '❌',
};

const filterLine = ({ targetUser, taskName, status, roleName }: HistoryFilterView): string =>
    [
        targetUser ? `User: **${targetUser.username}**` : '',
        taskName ? `Task: **${taskName}**` : '',
        status ? `Status: **${status}**` : '',
        roleName ? `Role: **${roleName}**` : '',
    ]
        .filter(Boolean)
        .join(' | ');

const historyField = (task: HistoryPageView['tasks'][number]) => {
    const icon = STATUS_ICONS[task.status] ?? 'ℹ️';
    const extended = task.hasExtended ? ' [Extended]' : '';
    let value = `**User:** ${task.member?.username || 'Unknown'}\n**Role:** ${task.roleName}\n**Type:** ${task.taskType}\n**Status:** ${task.status}${extended}\n**Assigned:** ${new Date(task.assignedAt).toLocaleString()}\n**Deadline:** <t:${String(unix(task.deadline))}:F>`;
    if (task.description) value += `\n**Description:** ${task.description}`;
    return { name: `${icon} ${taskTitle(task)}`, value, inline: false };
};

export const historyEmbed = (filters: HistoryFilterView, { tasks, page, totalPages, total }: HistoryPageView) => {
    const embed = new EmbedBuilder()
        .setTitle('📚 Task History ♪')
        .setColor(0x39c5bb)
        .setFooter({
            text: `🎵 Page ${String(page + 1)}/${String(totalPages)} | Total: ${String(total)} amazing task(s)!`,
        })
        .setTimestamp();
    const description = filterLine(filters);
    if (description) embed.setDescription(description);
    for (const task of tasks) embed.addFields(historyField(task));
    return embed;
};

export interface PagerState {
    readonly previousDisabled?: boolean;
    readonly nextDisabled?: boolean;
}

const pagerButton = (customId: string, label: string, disabled: boolean | undefined) => {
    const button = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(ButtonStyle.Primary);
    return disabled === undefined ? button : button.setDisabled(disabled);
};

export const pagerRow = ({ previousDisabled, nextDisabled }: PagerState) =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
        pagerButton('history_prev', 'Previous', previousDisabled),
        pagerButton('history_next', 'Next', nextDisabled),
    );
