import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    BackupConfigError,
    DEFAULT_RETENTION_DAYS,
    MAX_RETENTION_DAYS,
    readBackupConfig,
    readRestoreConfig,
} from '../Utils/Backup/backupConfig.js';

const baseEnv = { MONGO_URI: 'mongodb://localhost/sekai', BACKUP_DIR: '/backups' };

test('reads uri and directory and defaults retention to 14 days', () => {
    assert.deepEqual(readBackupConfig(baseEnv), {
        mongoUri: 'mongodb://localhost/sekai',
        directory: '/backups',
        retentionDays: DEFAULT_RETENTION_DAYS,
    });
});

test('trims surrounding whitespace from values', () => {
    const config = readBackupConfig({ MONGO_URI: '  mongodb://x  ', BACKUP_DIR: ' /b ' });
    assert.equal(config.mongoUri, 'mongodb://x');
    assert.equal(config.directory, '/b');
});

test('blank retention falls back to the default', () => {
    assert.equal(readBackupConfig({ ...baseEnv, BACKUP_RETENTION_DAYS: '  ' }).retentionDays, DEFAULT_RETENTION_DAYS);
});

test('accepts retention at both limits', () => {
    assert.equal(readBackupConfig({ ...baseEnv, BACKUP_RETENTION_DAYS: '1' }).retentionDays, 1);
    assert.equal(readBackupConfig({ ...baseEnv, BACKUP_RETENTION_DAYS: String(MAX_RETENTION_DAYS) }).retentionDays, MAX_RETENTION_DAYS);
});

for (const value of ['0', '-3', '2.5', 'abc', String(MAX_RETENTION_DAYS + 1)]) {
    test(`rejects retention ${value}`, () => {
        assert.throws(() => readBackupConfig({ ...baseEnv, BACKUP_RETENTION_DAYS: value }), BackupConfigError);
    });
}

for (const key of ['MONGO_URI', 'BACKUP_DIR']) {
    test(`requires ${key}`, () => {
        assert.throws(() => readBackupConfig({ ...baseEnv, [key]: undefined }), { name: 'BackupConfigError', message: `${key} must be set` });
        assert.throws(() => readBackupConfig({ ...baseEnv, [key]: '   ' }), BackupConfigError);
    });
}

test('restore takes a backup folder and a target uri', () => {
    assert.deepEqual(readRestoreConfig(['/b/sekai-1', 'mongodb://localhost/scratch']), {
        backupPath: '/b/sekai-1',
        targetUri: 'mongodb://localhost/scratch',
    });
});

test('restore refuses to run without both arguments', () => {
    assert.throws(() => readRestoreConfig([]), BackupConfigError);
    assert.throws(() => readRestoreConfig(['/b/sekai-1']), /Usage/);
});
