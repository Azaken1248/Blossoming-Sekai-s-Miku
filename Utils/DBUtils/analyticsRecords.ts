import Assignment from '../../DB/Schemas/assignment.ts';
import User from '../../DB/Schemas/user.ts';
import type { Filter } from '../domain/analyticsQuery.ts';

export type StoredRecord = Readonly<Record<string, unknown>>;

interface AssignmentQuery {
    readonly filter: Filter;
    readonly sort: string;
    readonly skip: number;
    readonly limit: number;
}

const OWNER_FIELDS = 'discordId username strikes isOnHiatus roles joinedAt';
const ROSTER_FIELDS = 'discordId username strikes isOnHiatus isDeboarded roles joinedAt';

export const findAssignments = ({ filter, sort, skip, limit }: AssignmentQuery) =>
    Assignment.find(filter).populate('userId', OWNER_FIELDS).sort(sort).skip(skip).limit(limit).lean<StoredRecord[]>();

export const pageMembers = ({ skip, limit }: { readonly skip: number; readonly limit: number }) =>
    Promise.all([
        User.find().sort('-joinedAt').skip(skip).limit(limit).select(ROSTER_FIELDS).lean<StoredRecord[]>(),
        User.estimatedDocumentCount(),
    ]);

const countWhere = (field: string) => ({ $sum: { $cond: [{ $eq: [field, true] }, 1, 0] } });

export const groupAssignments = (match: Filter, field: string) =>
    Assignment.aggregate<StoredRecord>([
        { $match: match },
        {
            $group: {
                _id: `$${field}`,
                totalTasks: { $sum: 1 },
                avgExtensions: { $avg: '$extensionCount' },
                extendedTasks: countWhere('$hasExtended'),
                firstRemindersSent: countWhere('$firstReminderSent'),
            },
        },
        { $sort: { totalTasks: -1 } },
    ]);

export interface AnalyticsRecords {
    readonly findAssignments: typeof findAssignments;
    readonly pageMembers: typeof pageMembers;
    readonly groupAssignments: typeof groupAssignments;
}
