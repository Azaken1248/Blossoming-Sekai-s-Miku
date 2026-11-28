import type { AnalyticsRecords } from '../Utils/DBUtils/analyticsRecords.ts';
import {
    buildFilter,
    buildSort,
    groupByOf,
    MAX_LIMIT,
    pageOf,
    type QueryInput,
} from '../Utils/domain/analyticsQuery.ts';

export const createAnalyticsService = ({ records }: { readonly records: AnalyticsRecords }) => ({
    assignments: async (query: QueryInput) => {
        const filter = buildFilter(query);
        const sort = buildSort(query['sort']);
        const { page, limit, skip } = pageOf(query);
        const data = await records.findAssignments({ filter, sort, skip, limit });
        return { page, limit, data };
    },

    members: async (query: QueryInput) => {
        const { page, limit, skip } = pageOf(query, MAX_LIMIT);
        const [data, total] = await records.pageMembers({ skip, limit });
        return { page, limit, total, data };
    },

    stats: async (query: QueryInput) => {
        const groupBy = groupByOf(query);
        const data = await records.groupAssignments(buildFilter(query), groupBy);
        return { groupBy, data };
    },
});
