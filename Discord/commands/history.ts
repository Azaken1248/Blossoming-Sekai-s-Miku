import { assignmentService } from '../../Services/index.ts';
import { attachPager, type Page } from '../components/historyPager.ts';
import type { CommandInteraction } from '../ports.ts';
import { historyEmbed, NO_HISTORY, pagerRow } from '../views/history.ts';

const filtersOf = ({ options }: CommandInteraction) => {
    const user = options.getUser('user') || null;
    return {
        targetUser: user,
        discordUserId: user ? user.id : null,
        taskName: options.getString('task') || null,
        status: options.getString('status') || null,
        roleName: options.getString('role') || null,
    };
};

type Filters = ReturnType<typeof filtersOf>;

const EMPTY_PAGE = { embeds: undefined, totalPages: Number.NaN, total: 0 };

const historyPage = async (filters: Filters, page: number): Promise<Page & { readonly total: number }> => {
    const found = await assignmentService.historyPage(filters, page);
    if (found.total === 0) return EMPTY_PAGE;
    return { embeds: [historyEmbed(filters, found)], totalPages: found.totalPages, total: found.total };
};

export const handleHistory = async (interaction: CommandInteraction) => {
    await interaction.deferReply();
    const filters = filtersOf(interaction);
    const first = await historyPage(filters, 0);
    if (first.total === 0) return interaction.editReply(NO_HISTORY);
    if (first.totalPages <= 1) return interaction.editReply({ embeds: first.embeds });

    const reply = await interaction.editReply({
        embeds: first.embeds,
        components: [pagerRow({ previousDisabled: true })],
        fetchReply: true,
    });
    attachPager(reply, interaction.user.id, first, (page) => historyPage(filters, page));
    return undefined;
};
