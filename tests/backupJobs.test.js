import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { runBackup, runCli, runRestore } from '../Utils/Backup/backupJobs.js';

const run = promisify(execFile);
const { MongoClient } = mongoose.mongo;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let mongod;
let client;
let workDir;

const silentLog = () => {
    const lines = { info: [], error: [] };
    return { lines, info: (line) => lines.info.push(line), error: (line) => lines.error.push(line) };
};

const uriFor = (database) => {
    const uri = new URL(mongod.getUri());
    uri.pathname = `/${database}`;
    return uri.toString();
};

const freshDir = (name) => mkdtemp(path.join(workDir, `${name}-`));

before(async () => {
    mongod = await MongoMemoryServer.create();
    client = await new MongoClient(mongod.getUri()).connect();
    workDir = await mkdtemp(path.join(tmpdir(), 'sekai-jobs-'));
    await client
        .db('jobs_source')
        .collection('users')
        .insertMany([{ discordId: '1' }, { discordId: '2' }]);
    await client.db('jobs_source').collection('assignments').insertOne({ taskId: 't1' });
});

after(async () => {
    await client.close();
    await mongod.stop();
    await rm(workDir, { recursive: true, force: true });
});

describe('runBackup and runRestore', () => {
    test('backs up, verifies, prunes and restores', async () => {
        const directory = await freshDir('job');
        const log = silentLog();
        const result = await runBackup(
            { MONGO_URI: uriFor('jobs_source'), BACKUP_DIR: directory, BACKUP_RETENTION_DAYS: '7' },
            log,
        );
        assert.deepEqual(result.verified, [
            { name: 'assignments', count: 1 },
            { name: 'users', count: 2 },
        ]);
        assert.deepEqual(result.removed, []);
        assert.match(log.lines.info[0], /assignments=1, users=2/);
        assert.equal(log.lines.info[1], 'Removed 0 backup(s) older than 7 days');

        const restoreLog = silentLog();
        const restored = await runRestore([result.backupPath, uriFor('jobs_restored')], restoreLog);
        assert.deepEqual(restored, [
            { name: 'assignments', count: 1 },
            { name: 'users', count: 2 },
        ]);
        assert.match(restoreLog.lines.info[0], /^Restored .* \(assignments=1, users=2\)$/);
        assert.equal(await client.db('jobs_restored').collection('users').countDocuments(), 2);
    });

    test('reports an empty database as having no collections', async () => {
        const log = silentLog();
        await runBackup({ MONGO_URI: uriFor('jobs_empty'), BACKUP_DIR: await freshDir('empty') }, log);
        assert.match(log.lines.info[0], /\(no collections\)$/);
    });

    test('restore refuses a target that already holds the collections', async () => {
        const directory = await freshDir('occupied');
        const { backupPath } = await runBackup(
            { MONGO_URI: uriFor('jobs_source'), BACKUP_DIR: directory },
            silentLog(),
        );
        await assert.rejects(runRestore([backupPath, uriFor('jobs_source')], silentLog()), {
            name: 'RestoreTargetInUseError',
        });
    });

    test('uses the console when no log is given', async (t) => {
        const info = t.mock.method(console, 'info', () => {});
        await runBackup({ MONGO_URI: uriFor('jobs_source'), BACKUP_DIR: await freshDir('console') });
        assert.equal(info.mock.callCount(), 2);
    });

    test('restore logs to the console when no log is given', async (t) => {
        const { backupPath } = await runBackup(
            { MONGO_URI: uriFor('jobs_source'), BACKUP_DIR: await freshDir('console-restore') },
            silentLog(),
        );
        const info = t.mock.method(console, 'info', () => {});
        await runRestore([backupPath, uriFor('jobs_console_restored')]);
        assert.equal(info.mock.callCount(), 1);
    });
});

describe('runCli', () => {
    test('returns 0 when the job succeeds', async () => {
        assert.equal(await runCli(async () => {}, null, silentLog()), 0);
    });

    test('returns 1 and logs only the error name and message when the job fails', async () => {
        const log = silentLog();
        const failing = async () => {
            throw new TypeError('bad thing');
        };
        assert.equal(await runCli(failing, null, log), 1);
        assert.deepEqual(log.lines.error, ['TypeError: bad thing']);
    });

    test('logs to the console by default', async (t) => {
        const error = t.mock.method(console, 'error', () => {});
        assert.equal(
            await runCli(async () => {
                throw new Error('x');
            }, null),
            1,
        );
        assert.equal(error.mock.callCount(), 1);
    });
});

describe('command line scripts', () => {
    const script = (name) => path.join(REPO, 'scripts', name);
    const cleanEnv = (extra) => {
        const env = { ...process.env };
        delete env.MONGO_URI;
        delete env.BACKUP_DIR;
        delete env.BACKUP_RETENTION_DAYS;
        return { ...env, ...extra };
    };

    test('backup and restore scripts run end to end', async () => {
        const cwd = await freshDir('cli-cwd');
        const directory = await freshDir('cli-backups');
        const backup = await run(process.execPath, [script('backupDatabase.js')], {
            cwd,
            env: cleanEnv({ MONGO_URI: uriFor('jobs_source'), BACKUP_DIR: directory }),
        });
        assert.match(backup.stdout, /Backup written to/);
        const [name] = await readdir(directory);
        const restore = await run(
            process.execPath,
            [script('restoreDatabase.js'), path.join(directory, name), uriFor('jobs_cli_restored')],
            { cwd, env: cleanEnv({}) },
        );
        assert.match(restore.stdout, /assignments=1, users=2/);
    });

    test('backup script exits 1 with a clear message when misconfigured', async () => {
        const cwd = await freshDir('cli-bad');
        await assert.rejects(
            run(process.execPath, [script('backupDatabase.js')], { cwd, env: cleanEnv({}) }),
            (error) => error.code === 1 && /BackupConfigError: MONGO_URI must be set/.test(error.stderr),
        );
    });

    test('restore script exits 1 without arguments', async () => {
        const cwd = await freshDir('cli-restore-bad');
        await assert.rejects(
            run(process.execPath, [script('restoreDatabase.js')], { cwd, env: cleanEnv({}) }),
            (error) => error.code === 1 && /Usage/.test(error.stderr),
        );
    });
});
