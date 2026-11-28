import type { Request, Response } from 'express';
import { recordService, strikeService } from '../../Services/index.ts';
import { handle } from './handle.ts';

const SNOWFLAKE = /^\d{17,20}$/;
const MAX_USERNAME = 100;

interface NewUserBody {
    readonly discordId?: unknown;
    readonly username?: unknown;
}

const asText = (value: unknown): string => (value as number).toString();

const refuseNewUser = ({ discordId, username }: NewUserBody): string | null => {
    if (!discordId || !username) return 'discordId and username are required';
    if (!SNOWFLAKE.test(asText(discordId))) return 'discordId must be a Discord snowflake (17-20 digits)';
    const name = asText(username);
    if (name.trim().length === 0 || name.length > MAX_USERNAME) return 'username must be between 1 and 100 characters';
    return null;
};

export const createUser = handle({ label: 'createUser', failure: 'Failed to create user' }, async (req, res) => {
    const body = (req.body ?? {}) as NewUserBody;
    const refusal = refuseNewUser(body);
    if (refusal) {
        res.status(400).json({ error: refusal });
        return;
    }
    const user = await recordService.register(asText(body.discordId), asText(body.username).trim());
    res.status(201).json({ success: true, data: user });
});

const strike = (label: string, failure: string, apply: (discordId: string) => Promise<number | null>) =>
    handle({ label, failure }, async (req: Request, res: Response) => {
        const strikes = await apply(String(req.params['discordId']));
        if (strikes === null) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json({ success: true, strikes });
    });

export const addStrike = strike('addStrike', 'Failed to add strike', (discordId) =>
    strikeService.addExisting(discordId),
);

export const removeStrike = strike('removeStrike', 'Failed to remove strike', (discordId) =>
    strikeService.removeExisting(discordId),
);
