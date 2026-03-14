import Assignment from '../../DB/Schemas/assignment.js';
import User from '../../DB/Schemas/user.js';
import QueryBuilder from '../utils/queryBuilder.js';

export const getFilteredAssignments = async (req, res) => {
    try {
        const features = new QueryBuilder(
            Assignment.find().populate('userId', 'discordId username strikes isOnHiatus roles joinedAt'),
            req.query
        )
            .filter()
            .sort()
            .paginate();
            
        const assignments = await features.query;
        res.status(200).json({ success: true, count: assignments.length, data: assignments });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getUsersWithAssignments = async (_req, res) => {
    try {
        const users = await User.find()
            .sort('-joinedAt')
            .populate('assignments', 'taskType taskName roleName status deadline assignedAt hasExtended extensionCount');

        res.status(200).json({ success: true, count: users.length, data: users });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getAssignmentStats = async (req, res) => {
    try {

        const matchObj = { ...req.query };
        const excludedFields = ['groupBy', 'sort', 'limit'];
        excludedFields.forEach(el => delete matchObj[el]);
        
        let queryStr = JSON.stringify(matchObj);
        queryStr = queryStr.replace(/\b(gte|gt|lte|lt|ne)\b/g, match => `$${match}`);
        const parsedMatch = JSON.parse(queryStr);

        const groupByField = req.query.groupBy ? `$${req.query.groupBy}` : '$status';

        const stats = await Assignment.aggregate([
            { $match: parsedMatch },
            { 
                $group: {
                    _id: groupByField,
                    totalTasks: { $sum: 1 },
                    avgExtensions: { $avg: '$extensionCount' },
                    extendedTasks: { 
                        $sum: { $cond: [{ $eq: ['$hasExtended', true] }, 1, 0] } 
                    },
                    firstRemindersSent: { 
                        $sum: { $cond: [{ $eq: ['$firstReminderSent', true] }, 1, 0] } 
                    }
                } 
            },
            { $sort: { totalTasks: -1 } }
        ]);

        res.status(200).json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};