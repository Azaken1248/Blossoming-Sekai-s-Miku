import { isIP } from 'node:net';

export const DEFAULT_PORT = 3000;
export const DEFAULT_HOST = '127.0.0.1';

const isBlank = (raw: string | undefined): raw is undefined | '' => raw === undefined || raw.trim() === '';

export const readPort = (raw: string | undefined): number => {
    if (isBlank(raw)) return DEFAULT_PORT;
    const port = Number(raw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new RangeError(`PORT must be a whole number from 1 to 65535, got "${raw}"`);
    }
    return port;
};

export const readHost = (raw: string | undefined): string => {
    if (isBlank(raw)) return DEFAULT_HOST;
    const host = raw.trim();
    if (host !== 'localhost' && isIP(host) === 0) {
        throw new RangeError(`HOST must be an IP address or localhost, got "${raw}"`);
    }
    return host;
};

export const describeAddress = (host: string, port: number): string =>
    `http://${isIP(host) === 6 ? `[${host}]` : host}:${String(port)}`;
