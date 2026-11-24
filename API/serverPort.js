export const DEFAULT_PORT = 3000;

export const readPort = (raw) => {
    if (raw === undefined || raw.trim() === '') {
        return DEFAULT_PORT;
    }
    const port = Number(raw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new RangeError(`PORT must be a whole number from 1 to 65535, got "${raw}"`);
    }
    return port;
};
