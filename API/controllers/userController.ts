import type { Request, Response } from 'express';
import { SearchTooLongError } from '../../Services/index.ts';
import { profileService } from '../services.ts';
import { handle } from './handle.ts';

const discordIdOf = (req: Request) => String(req.params['discordId']);

const refuseLongSearch = (error: unknown, res: Response) => {
    if (!(error instanceof SearchTooLongError)) return false;
    res.status(400).json({ error: error.message });
    return true;
};

export const listUsers = handle(
    { label: 'listUsers', failure: 'Failed to list users', known: refuseLongSearch },
    async (req, res) => {
        const data = await profileService.roster({
            limit: req.query['limit'],
            search: req.query['search'] as string | null | undefined,
        });
        res.json({ success: true, count: data.length, data });
    },
);

export const getUser = handle({ label: 'getUser', failure: 'Failed to fetch user' }, async (req, res) => {
    const user = await profileService.record(discordIdOf(req));
    if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    res.json({ success: true, data: user });
});

export const getUserSummary = handle(
    { label: 'getUserSummary', failure: 'Failed to build user summary' },
    async (req, res) => {
        const summary = await profileService.summary(discordIdOf(req));
        if (!summary) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json({ success: true, data: summary });
    },
);
