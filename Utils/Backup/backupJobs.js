import mongoose from 'mongoose';
import { readBackupConfig, readRestoreConfig } from './backupConfig.js';
import { createBackup, pruneBackups, restoreBackup, verifyBackup } from './backupStore.js';

const { MongoClient } = mongoose.mongo;

const describeCounts = (collections) =>
    collections.map(({ name, count }) => `${name}=${count}`).join(', ') || 'no collections';

const withDatabase = async (uri, work) => {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        return await work(client.db());
    } finally {
        await client.close();
    }
};

export const runBackup = async (env, log = console) => {
    const config = readBackupConfig(env);
    const { path: backupPath } = await withDatabase(config.mongoUri, (db) =>
        createBackup(db, { directory: config.directory }));
    const verified = await verifyBackup(backupPath);
    const removed = await pruneBackups(config.directory, { retentionDays: config.retentionDays });
    log.info(`Backup written to ${backupPath} (${describeCounts(verified)})`);
    log.info(`Removed ${removed.length} backup(s) older than ${config.retentionDays} days`);
    return { backupPath, verified, removed };
};

export const runRestore = async (args, log = console) => {
    const { backupPath, targetUri } = readRestoreConfig(args);
    await verifyBackup(backupPath);
    const restored = await withDatabase(targetUri, (db) => restoreBackup(db, backupPath));
    log.info(`Restored ${backupPath} (${describeCounts(restored)})`);
    return restored;
};

export const runCli = async (job, input, log = console) => {
    try {
        await job(input, log);
        return 0;
    } catch (error) {
        log.error(`${error.name}: ${error.message}`);
        return 1;
    }
};
