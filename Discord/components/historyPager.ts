import type { PageClick, SentReply } from '../ports.ts';
import { pagerRow } from '../views/history.ts';

const PAGER_LIFETIME_MS = 300000;

export interface Page {
    readonly embeds: readonly unknown[] | undefined;
    readonly totalPages: number;
}

export const attachPager = (
    reply: SentReply,
    ownerId: string,
    firstPage: Page,
    render: (page: number) => Promise<Page>,
): void => {
    const collector = reply.createMessageComponentCollector({
        time: PAGER_LIFETIME_MS,
        filter: (click: PageClick) => click.user.id === ownerId,
    });
    let currentPage = 0;

    collector.on('collect', async (click) => {
        await click.deferUpdate();
        if (click.customId === 'history_prev') currentPage = Math.max(0, currentPage - 1);
        if (click.customId === 'history_next') currentPage = Math.min(firstPage.totalPages - 1, currentPage + 1);
        const page = await render(currentPage);
        const row = pagerRow({ previousDisabled: currentPage === 0, nextDisabled: currentPage >= page.totalPages - 1 });
        await click.editReply({ embeds: page.embeds, components: [row] });
    });

    collector.on('end', () => {
        reply.edit({ components: [pagerRow({ previousDisabled: true, nextDisabled: true })] }).catch(() => {});
    });
};
