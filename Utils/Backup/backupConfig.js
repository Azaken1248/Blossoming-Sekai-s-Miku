export const DEFAULT_RETENTION_DAYS = 14;
export const MAX_RETENTION_DAYS = 3650;

export class BackupConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BackupConfigError';
    }
}

const requireValue = (env, key) => {
    const value = env[key]?.trim();
    if (!value) {
        throw new BackupConfigError(`${key} must be set`);
    }
    return value;
};

const readRetentionDays = (raw) => {
    if (raw === undefined || raw.trim() === '') {
        return DEFAULT_RETENTION_DAYS;
    }
    const days = Number(raw);
    if (!Number.isInteger(days) || days < 1 || days > MAX_RETENTION_DAYS) {
        throw new BackupConfigError(`BACKUP_RETENTION_DAYS must be a whole number from 1 to ${MAX_RETENTION_DAYS}`);
    }
    return days;
};

export const readBackupConfig = (env) => ({
    mongoUri: requireValue(env, 'MONGO_URI'),
    directory: requireValue(env, 'BACKUP_DIR'),
    retentionDays: readRetentionDays(env.BACKUP_RETENTION_DAYS),
});

export const readRestoreConfig = (args) => {
    const [backupPath, targetUri] = args;
    if (!backupPath || !targetUri) {
        throw new BackupConfigError('Usage: npm run restore -- <backup folder> <target mongodb uri>');
    }
    return { backupPath, targetUri };
};
