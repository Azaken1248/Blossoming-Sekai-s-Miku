import type { Request, Response } from 'express';
import { analyticsService } from '../../Services/index.ts';
import { QueryError } from '../../Utils/domain/analyticsQuery.ts';

const answer =
    (label: string, run: (query: Request['query']) => Promise<Record<string, unknown>>) =>
    (req: Request, res: Response): void => {
        run(req.query).then(
            (body) => res.status(200).json({ success: true, ...body }),
            (error: unknown) => {
                if (error instanceof QueryError) return res.status(400).json({ error: error.message });
                console.error(`[API] ${label} failed:`, error);
                return res.status(500).json({ error: `Failed to fetch ${label}` });
            },
        );
    };

export const getFilteredAssignments = answer('assignments', async (query) => {
    const { page, limit, data } = await analyticsService.assignments(query);
    return { count: data.length, page, limit, data };
});

export const getUsersWithAssignments = answer('users', async (query) => {
    const { page, limit, total, data } = await analyticsService.members(query);
    return { count: data.length, page, limit, total, data };
});

export const getAssignmentStats = answer('stats', async (query) => {
    const { groupBy, data } = await analyticsService.stats(query);
    return { groupBy, data };
});
