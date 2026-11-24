import crypto from 'node:crypto';

/**
 * Shared-secret guard for the API's mutating endpoints.
 *
 * Every write route was previously reachable by anyone on the internet, with
 * CORS wide open - `curl -X POST .../strikes/add` was enough to punish any
 * member, and three of those trigger the automatic role-stripping demotion.
 *
 * Present the secret as an `x-api-key` header.
 */

const MIN_RECOMMENDED_KEY_LENGTH = 32;

const getApiKey = () => process.env.API_KEY || '';

/**
 * Constant-time comparison.
 *
 * Both sides are hashed first so the comparison length is fixed: timingSafeEqual
 * throws on a length mismatch, and comparing raw lengths would leak the size of
 * the real key.
 */
const secretsMatch = (presented, expected) => {
    const a = crypto.createHash('sha256').update(String(presented), 'utf8').digest();
    const b = crypto.createHash('sha256').update(String(expected), 'utf8').digest();
    return crypto.timingSafeEqual(a, b);
};

export const requireApiKey = (req, res, next) => {
    const expected = getApiKey();

    // Fail closed. A privileged operation must never run just because the
    // credential that protects it was not configured. Reads are unaffected, so
    // a missing key degrades writes rather than taking the whole API down.
    if (!expected) {
        console.error(`[AUTH] Rejected ${req.method} ${req.originalUrl} - API_KEY is not configured on this server.`);
        return res.status(503).json({
            error: 'Write operations are disabled: the server has no API_KEY configured.',
        });
    }

    const presented = req.get('x-api-key');
    if (!presented || !secretsMatch(presented, expected)) {
        console.warn(`[AUTH] Unauthorized ${req.method} ${req.originalUrl} from ${req.ip ?? 'unknown'}`);
        return res.status(401).json({ error: 'Unauthorized' });
    }

    return next();
};

/** Print the key's status once at startup so a misconfiguration is obvious. */
export const reportApiKeyStatus = () => {
    const key = getApiKey();

    if (!key) {
        console.warn('');
        console.warn('  ⚠️  API_KEY is not set.');
        console.warn('     Read endpoints work normally. Every write endpoint will return 503.');
        console.warn('     Generate one with:');
        console.warn("       node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
        console.warn('     then add API_KEY=<value> to your .env and restart.');
        console.warn('');
        return;
    }

    if (key.length < MIN_RECOMMENDED_KEY_LENGTH) {
        console.warn(
            `[AUTH] ⚠️  API_KEY is only ${key.length} characters. ` +
                `At least ${MIN_RECOMMENDED_KEY_LENGTH} is recommended.`,
        );
        return;
    }

    console.log('[AUTH] ✅ API_KEY configured; write endpoints are protected.');
};
