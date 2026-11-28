import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const MIN_RECOMMENDED_KEY_LENGTH = 32;

const getApiKey = () => process.env['API_KEY'] || '';

const digest = (secret: string) => crypto.createHash('sha256').update(secret, 'utf8').digest();

const secretsMatch = (presented: string, expected: string) =>
    crypto.timingSafeEqual(digest(presented), digest(expected));

export const requireApiKey = (req: Request, res: Response, next: NextFunction): void => {
    const expected = getApiKey();
    if (!expected) {
        console.error(`[AUTH] Rejected ${req.method} ${req.originalUrl} - API_KEY is not configured on this server.`);
        res.status(503).json({ error: 'Write operations are disabled: the server has no API_KEY configured.' });
        return;
    }
    const presented = req.get('x-api-key');
    if (!presented || !secretsMatch(presented, expected)) {
        console.warn(`[AUTH] Unauthorized ${req.method} ${req.originalUrl} from ${req.ip ?? 'unknown'}`);
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    next();
};

const warnMissingKey = () => {
    console.warn('');
    console.warn('  ⚠️  API_KEY is not set.');
    console.warn('     Read endpoints work normally. Every write endpoint will return 503.');
    console.warn('     Generate one with:');
    console.warn("       node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
    console.warn('     then add API_KEY=<value> to your .env and restart.');
    console.warn('');
};

export const reportApiKeyStatus = (): void => {
    const key = getApiKey();
    if (!key) {
        warnMissingKey();
        return;
    }
    if (key.length < MIN_RECOMMENDED_KEY_LENGTH) {
        console.warn(
            `[AUTH] ⚠️  API_KEY is only ${String(key.length)} characters. ` +
                `At least ${String(MIN_RECOMMENDED_KEY_LENGTH)} is recommended.`,
        );
        return;
    }
    console.log('[AUTH] ✅ API_KEY configured; write endpoints are protected.');
};
