import type { CorsOptions } from 'cors';

export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = ['https://sekai.azaken.com'];

const LOCALHOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5}|)$/;

interface CorsSettings {
    readonly configured?: string | undefined;
    readonly isProduction?: boolean;
}

export const parseOriginList = (raw: string | null | undefined): string[] =>
    (raw ?? '')
        .split(',')
        .map((entry) => entry.trim().replace(/\/$/, ''))
        .filter(Boolean);

const allowListOf = (configured: string | undefined) => {
    const configuredList = parseOriginList(configured);
    return { configuredList, allowed: configuredList.length ? configuredList : DEFAULT_ALLOWED_ORIGINS };
};

export const isOriginAllowed = (
    origin: string | undefined,
    { configured, isProduction = true }: CorsSettings = {},
): boolean => {
    if (!origin) return true;
    if (allowListOf(configured).allowed.includes(origin.replace(/\/$/, ''))) return true;
    return !isProduction && LOCALHOST_PATTERN.test(origin);
};

const withEnvironment = ({
    configured = process.env['CORS_ORIGINS'],
    isProduction = process.env['NODE_ENV'] === 'production',
}: CorsSettings) => ({ configured, isProduction });

export const buildCorsOptions = (settings: CorsSettings = {}): CorsOptions => {
    const resolved = withEnvironment(settings);
    return {
        origin(origin, callback) {
            callback(null, isOriginAllowed(origin, resolved));
        },
        methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'x-api-key'],
        maxAge: 86400,
    };
};

export const describeCorsPolicy = (settings: CorsSettings = {}): string => {
    const { configured, isProduction } = withEnvironment(settings);
    const { configuredList, allowed } = allowListOf(configured);
    const source = configuredList.length ? 'CORS_ORIGINS' : 'default';
    const dev = isProduction ? '' : ' (+ localhost, non-production)';
    return `[CORS] Allowing ${allowed.join(', ')}${dev} [from ${source}]`;
};
