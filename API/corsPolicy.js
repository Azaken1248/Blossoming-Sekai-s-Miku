/**
 * CORS policy.
 *
 * Was `cors()` - Access-Control-Allow-Origin: * - which let any site on the
 * internet read the roster, strike counts and hiatus state from a visitor's
 * browser.
 *
 * Extend it without touching this file by setting CORS_ORIGINS in .env:
 *
 *   CORS_ORIGINS=https://sekai.azaken.com,https://staging.sekai.azaken.com
 *
 * When CORS_ORIGINS is unset the production default below applies. Outside
 * production, localhost on any port is additionally allowed so the pages can be
 * opened locally against a dev API.
 */

export const DEFAULT_ALLOWED_ORIGINS = ['https://sekai.azaken.com'];

const LOCALHOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5}|)$/;

export const parseOriginList = (raw) =>
    String(raw ?? '')
        .split(',')
        .map((entry) => entry.trim().replace(/\/$/, ''))
        .filter(Boolean);

/**
 * Decide whether an Origin header is allowed.
 *
 * @param {string|undefined} origin - the request's Origin, absent for non-browser callers
 * @param {{ configured?: string, isProduction?: boolean }} options
 */
export const isOriginAllowed = (origin, { configured, isProduction = true } = {}) => {
    // No Origin header: curl, server-to-server, Discord link unfurlers. CORS is
    // a browser mechanism and does not apply to these, so let them through -
    // the API key is what actually protects writes.
    if (!origin) return true;

    const allowList = parseOriginList(configured);
    const allowed = allowList.length ? allowList : DEFAULT_ALLOWED_ORIGINS;

    if (allowed.includes(origin.replace(/\/$/, ''))) return true;
    if (!isProduction && LOCALHOST_PATTERN.test(origin)) return true;

    return false;
};

/** Build the options object for the `cors` middleware. */
export const buildCorsOptions = ({
    configured = process.env.CORS_ORIGINS,
    isProduction = process.env.NODE_ENV === 'production',
} = {}) => ({
    origin(origin, callback) {
        // Pass `false` rather than an Error: a rejected origin should simply
        // receive no CORS headers, not a 500.
        callback(null, isOriginAllowed(origin, { configured, isProduction }));
    },
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-api-key'],
    maxAge: 86400,
});

/** One-line summary for the startup log. */
export const describeCorsPolicy = ({
    configured = process.env.CORS_ORIGINS,
    isProduction = process.env.NODE_ENV === 'production',
} = {}) => {
    const allowList = parseOriginList(configured);
    const allowed = allowList.length ? allowList : DEFAULT_ALLOWED_ORIGINS;
    const source = allowList.length ? 'CORS_ORIGINS' : 'default';
    const dev = isProduction ? '' : ' (+ localhost, non-production)';
    return `[CORS] Allowing ${allowed.join(', ')}${dev} [from ${source}]`;
};
