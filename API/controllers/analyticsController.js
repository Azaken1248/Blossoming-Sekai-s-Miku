import Assignment from '../../DB/Schemas/assignment.js';
import User from '../../DB/Schemas/user.js';
import QueryBuilder, { buildFilter, QueryError, MAX_LIMIT } from '../utils/queryBuilder.js';

/** Fields a caller may group statistics by. Anything else is rejected. */
const GROUPABLE_FIELDS = new Set(['status', 'roleName', 'roleCategoryId', 'taskType', 'discordUserId', 'hasExtended']);

const handleQueryError = (error, res, label) => {
    if (error instanceof QueryError) {
        return res.status(400).json({ error: error.message });
    }
    console.error(`[API] ${label} failed:`, error);
    return res.status(500).json({ error: `Failed to fetch ${label}` });
};

export const getFilteredAssignments = async (req, res) => {
    try {
        const features = new QueryBuilder(
            Assignment.find().populate('userId', 'discordId username strikes isOnHiatus roles joinedAt'),
            req.query,
        )
            .filter()
            .sort()
            .paginate();

        const assignments = await features.query.lean();
        res.status(200).json({
            success: true,
            count: assignments.length,
            page: features.page,
            limit: features.limit,
            data: assignments,
        });
    } catch (error) {
        return handleQueryError(error, res, 'assignments');
    }
};

export const getUsersWithAssignments = async (req, res) => {
    try {
        // Previously returned every user with every assignment populated and no
        // limit. The dashboard only reads the scalar fields, so the payload is
        // now bounded and projected.
        const limit = Math.min(Math.max(1, Number(req.query.limit) || MAX_LIMIT), MAX_LIMIT);
        const page = Math.max(1, Number(req.query.page) || 1);

        const [users, total] = await Promise.all([
            User.find()
                .sort('-joinedAt')
                .skip((page - 1) * limit)
                .limit(limit)
                .select('discordId username strikes isOnHiatus isDeboarded roles joinedAt')
                .lean(),
            User.estimatedDocumentCount(),
        ]);

        res.status(200).json({ success: true, count: users.length, page, limit, total, data: users });
    } catch (error) {
        return handleQueryError(error, res, 'users');
    }
};

export const getAssignmentStats = async (req, res) => {
    try {
        const requestedGroupBy = req.query.groupBy || 'status';
        if (!GROUPABLE_FIELDS.has(requestedGroupBy)) {
            return res.status(400).json({
                error: `groupBy must be one of: ${[...GROUPABLE_FIELDS].join(', ')}`,
            });
        }

        // Same allowlisted filter builder the list endpoint uses, so an
        // arbitrary $match can no longer be injected through the query string.
        const match = buildFilter(req.query);

        const stats = await Assignment.aggregate([
            { $match: match },
            {
                $group: {
                    _id: `$${requestedGroupBy}`,
                    totalTasks: { $sum: 1 },
                    avgExtensions: { $avg: '$extensionCount' },
                    extendedTasks: {
                        $sum: { $cond: [{ $eq: ['$hasExtended', true] }, 1, 0] },
                    },
                    firstRemindersSent: {
                        $sum: { $cond: [{ $eq: ['$firstReminderSent', true] }, 1, 0] },
                    },
                },
            },
            { $sort: { totalTasks: -1 } },
        ]);

        res.status(200).json({ success: true, groupBy: requestedGroupBy, data: stats });
    } catch (error) {
        return handleQueryError(error, res, 'stats');
    }
};
