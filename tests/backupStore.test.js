import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
    BackupFormatError,
    FORMAT_VERSION,
    INSERT_BATCH_SIZE,
    MANIFEST_FILE,
    RestoreTargetInUseError,
    backupName,
    createBackup,
    parseBackupName,
    pruneBackups,
    readManifest,
    restoreBackup,
    verifyBackup,
} from '../Utils/Backup/backupStore.js';

const { MongoClient, ObjectId, Long, Decimal128 } = mongoose.mongo;
const NOW = new Date('2026-11-22T03:00:00.000Z');
const DAY_MS = 86_400_000;

let mongod;
let client;
let workDir;

before(async () => {
    mongod = await MongoMemoryServer.create();
    client = await new MongoClient(mongod.getUri()).connect();
    workDir = await mkdtemp(path.join(tmpdir(), 'sekai-backup-'));
});

after(async () => {
    await client.close();
    await mongod.stop();
    await rm(workDir, { recursive: true, force: true });
});

const freshDir = (name) => mkdtemp(path.join(workDir, `${name}-`));

const writeManifest = async (dir, manifest) => {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, MANIFEST_FILE), JSON.stringify(manifest));
};

const validEntry = { name: 'users', file: '0001.ejson.gz', count: 0, indexes: [] };

describe('names', () => {
    test('backupName uses a compact UTC timestamp', () => {
        assert.equal(backupName(NOW), 'sekai-20261122T030000Z');
    });

    test('parseBackupName reads complete and partial names', () => {
        assert.deepEqual(parseBackupName('sekai-20261122T030000Z'), { date: NOW, partial: false });
        assert.deepEqual(parseBackupName('sekai-20261122T030000Z.partial'), { date: NOW, partial: true });
    });

    test('parseBackupName ignores other names and impossible dates', () => {
        assert.equal(parseBackupName('notes'), null);
        assert.equal(parseBackupName('sekai-20261399T000000Z'), null);
    });
});

describe('backup and restore round trip', () => {
    const source = () => client.db('roundtrip_source');
    let backup;

    before(async () => {
        const users = source().collection('users');
        await users.createIndex({ discordId: 1 }, { unique: true, name: 'discordId_unique' });
        await users.insertMany([
            {
                _id: new ObjectId(),
                discordId: '111',
                joinedAt: NOW,
                strikes: Long.fromString('9007199254740993'),
                score: Decimal128.fromString('1.10'),
                tags: ['va', { nested: true }],
            },
            { _id: new ObjectId(), discordId: '222', joinedAt: null },
        ]);
        await source().createCollection('emptyOne');
        await source().createCollection('openTasks', { viewOn: 'users', pipeline: [{ $match: { discordId: '111' } }] });
        backup = await createBackup(source(), { directory: await freshDir('roundtrip'), now: NOW });
    });

    test('writes a manifest with every real collection and its indexes', () => {
        assert.equal(path.basename(backup.path), 'sekai-20261122T030000Z');
        assert.equal(backup.manifest.formatVersion, FORMAT_VERSION);
        assert.equal(backup.manifest.database, 'roundtrip_source');
        assert.equal(backup.manifest.createdAt, NOW.toISOString());
        assert.deepEqual(
            backup.manifest.collections.map(({ name, file, count }) => ({ name, file, count })),
            [
                { name: 'emptyOne', file: '0001.ejson.gz', count: 0 },
                { name: 'users', file: '0002.ejson.gz', count: 2 },
            ],
        );
        assert.deepEqual(backup.manifest.collections[1].indexes, [
            { key: { discordId: 1 }, name: 'discordId_unique', unique: true },
        ]);
    });

    test('leaves no partial folder behind', async () => {
        assert.deepEqual(await readdir(path.dirname(backup.path)), ['sekai-20261122T030000Z']);
    });

    test('verifies against the manifest without a database', async () => {
        assert.deepEqual(await verifyBackup(backup.path), [
            { name: 'emptyOne', count: 0 },
            { name: 'users', count: 2 },
        ]);
    });

    test('restores identical documents, types and indexes', async () => {
        const target = client.db('roundtrip_target');
        assert.deepEqual(await restoreBackup(target, backup.path), [
            { name: 'emptyOne', count: 0 },
            { name: 'users', count: 2 },
        ]);
        const sort = { discordId: 1 };
        assert.deepEqual(
            await target
                .collection('users')
                .find({}, { promoteLongs: false, promoteValues: false })
                .sort(sort)
                .toArray(),
            await source()
                .collection('users')
                .find({}, { promoteLongs: false, promoteValues: false })
                .sort(sort)
                .toArray(),
        );
        const indexNames = (await target.collection('users').indexes()).map(({ name }) => name).sort();
        assert.deepEqual(indexNames, ['_id_', 'discordId_unique']);
        assert.equal(await target.collection('emptyOne').countDocuments(), 0);
    });

    test('refuses to restore over collections that already exist', async () => {
        const target = client.db('roundtrip_occupied');
        await target.collection('users').insertOne({ discordId: 'keep me' });
        await assert.rejects(restoreBackup(target, backup.path), (error) => {
            assert.ok(error instanceof RestoreTargetInUseError);
            assert.deepEqual(error.collections, ['users']);
            return true;
        });
        assert.equal(await target.collection('users').countDocuments(), 1);
        assert.deepEqual(
            (await target.listCollections().toArray()).map(({ name }) => name),
            ['users'],
        );
    });
});

describe('large collections', () => {
    for (const total of [INSERT_BATCH_SIZE, INSERT_BATCH_SIZE * 2 + 7]) {
        test(`restores ${total} documents across insert batches`, async () => {
            const source = client.db(`batch_source_${total}`);
            await source.collection('tasks').insertMany(Array.from({ length: total }, (_, i) => ({ i })));
            const { path: backupPath } = await createBackup(source, {
                directory: await freshDir(`batch${total}`),
                now: NOW,
            });
            const target = client.db(`batch_target_${total}`);
            assert.deepEqual(await restoreBackup(target, backupPath), [{ name: 'tasks', count: total }]);
            assert.equal(await target.collection('tasks').countDocuments(), total);
        });
    }
});

describe('createBackup failures', () => {
    test('removes the partial folder and rethrows', async () => {
        const directory = await freshDir('failure');
        const broken = {
            listCollections: () => ({
                toArray: async () => {
                    throw new Error('connection lost');
                },
            }),
        };
        await assert.rejects(createBackup(broken, { directory, now: NOW }), /connection lost/);
        assert.deepEqual(await readdir(directory), []);
    });

    test('replaces a partial folder left by an earlier crash', async () => {
        const directory = await freshDir('crash');
        const leftover = path.join(directory, 'sekai-20261122T030000Z.partial');
        await mkdir(leftover);
        await writeFile(path.join(leftover, 'junk'), 'x');
        const db = client.db('crash_source');
        await db.collection('users').insertOne({ a: 1 });
        await createBackup(db, { directory, now: NOW });
        assert.deepEqual(await readdir(directory), ['sekai-20261122T030000Z']);
    });

    test('uses the current time when none is given', async () => {
        const db = client.db('clock_source');
        await db.collection('users').insertOne({ a: 1 });
        const before = Date.now() - 1000;
        const { path: backupPath } = await createBackup(db, { directory: await freshDir('clock') });
        const { date } = parseBackupName(path.basename(backupPath));
        assert.ok(date.getTime() >= before && date.getTime() <= Date.now());
    });

    test('creates the backup directory when it does not exist', async () => {
        const directory = path.join(await freshDir('nested'), 'a', 'b');
        const db = client.db('nested_source');
        await db.collection('users').insertOne({ a: 1 });
        await createBackup(db, { directory, now: NOW });
        assert.ok((await stat(directory)).isDirectory());
    });
});

describe('readManifest', () => {
    test('accepts a valid manifest', async () => {
        const dir = await freshDir('manifest-ok');
        await writeManifest(dir, { formatVersion: FORMAT_VERSION, collections: [validEntry] });
        assert.deepEqual((await readManifest(dir)).collections, [validEntry]);
    });

    test('rejects a missing manifest', async () => {
        await assert.rejects(readManifest(await freshDir('manifest-missing')), BackupFormatError);
    });

    test('rejects a manifest that is not JSON', async () => {
        const dir = await freshDir('manifest-garbage');
        await writeFile(path.join(dir, MANIFEST_FILE), '{nope');
        await assert.rejects(readManifest(dir), /Cannot read manifest.json/);
    });

    for (const [label, manifest] of [
        ['null', null],
        ['an unknown version', { formatVersion: 99, collections: [] }],
    ]) {
        test(`rejects ${label}`, async () => {
            const dir = await freshDir('manifest-version');
            await writeManifest(dir, manifest);
            await assert.rejects(readManifest(dir), /Unsupported backup format version/);
        });
    }

    const badEntries = {
        'collections that are not a list': 'users',
        'a null entry': [null],
        'a non-string name': [{ ...validEntry, name: 5 }],
        'an empty name': [{ ...validEntry, name: '' }],
        'a non-string file': [{ ...validEntry, file: 7 }],
        'a file outside the backup folder': [{ ...validEntry, file: '../../etc/passwd' }],
        'a fractional count': [{ ...validEntry, count: 1.5 }],
        'a negative count': [{ ...validEntry, count: -1 }],
        'indexes that are not a list': [{ ...validEntry, indexes: {} }],
    };
    for (const [label, collections] of Object.entries(badEntries)) {
        test(`rejects ${label}`, async () => {
            const dir = await freshDir('manifest-entry');
            await writeManifest(dir, { formatVersion: FORMAT_VERSION, collections });
            await assert.rejects(readManifest(dir), /invalid collection list/);
        });
    }
});

describe('damaged data files', () => {
    const backupWithData = async (label, data, count) => {
        const dir = await freshDir(label);
        await writeManifest(dir, { formatVersion: FORMAT_VERSION, collections: [{ ...validEntry, count }] });
        await writeFile(path.join(dir, validEntry.file), data);
        return dir;
    };

    test('reads a last line that has no trailing newline', async () => {
        const dir = await backupWithData(
            'no-newline',
            gzipSync('{"a":{"$numberInt":"1"}}\n{"a":{"$numberInt":"2"}}'),
            2,
        );
        assert.deepEqual(await verifyBackup(dir), [{ name: 'users', count: 2 }]);
    });

    test('rejects a count that differs from the manifest', async () => {
        const dir = await backupWithData('wrong-count', gzipSync('{"a":{"$numberInt":"1"}}\n'), 3);
        await assert.rejects(verifyBackup(dir), /manifest says 3 documents, file has 1/);
        await assert.rejects(
            restoreBackup(client.db('wrong_count_target'), dir),
            /manifest says 3 documents, file has 1/,
        );
    });

    test('rejects a line that is not EJSON', async () => {
        const dir = await backupWithData('bad-line', gzipSync('{"a":1}\nnot json\n'), 2);
        await assert.rejects(verifyBackup(dir), {
            name: 'BackupFormatError',
            message: '0001.ejson.gz has a line that is not valid EJSON',
        });
    });

    test('rejects a file that is not gzip', async () => {
        const dir = await backupWithData('not-gzip', 'plain text', 0);
        await assert.rejects(verifyBackup(dir), /incorrect header check/);
    });

    test('rejects a missing data file', async () => {
        const dir = await freshDir('missing-data');
        await writeManifest(dir, { formatVersion: FORMAT_VERSION, collections: [validEntry] });
        await assert.rejects(verifyBackup(dir), /ENOENT/);
    });
});

describe('pruneBackups', () => {
    const makeBackups = async (names) => {
        const directory = await freshDir('prune');
        for (const name of names) {
            await mkdir(path.join(directory, name));
        }
        return directory;
    };
    const daysAgo = (days) => backupName(new Date(NOW.getTime() - days * DAY_MS));

    test('removes complete and partial backups older than the retention window', async () => {
        const keep = [daysAgo(0), daysAgo(13)];
        const drop = [daysAgo(15), `${daysAgo(20)}.partial`];
        const directory = await makeBackups([...keep, ...drop]);
        const removed = await pruneBackups(directory, { retentionDays: 14, now: NOW });
        assert.deepEqual(removed.sort(), [...drop].sort());
        assert.deepEqual((await readdir(directory)).sort(), [...keep].sort());
    });

    test('always keeps the newest complete backup, even when it is old', async () => {
        const directory = await makeBackups([daysAgo(30), daysAgo(40), `${daysAgo(25)}.partial`]);
        const removed = await pruneBackups(directory, { retentionDays: 14, now: NOW });
        assert.deepEqual(removed.sort(), [daysAgo(40), `${daysAgo(25)}.partial`].sort());
        assert.deepEqual(await readdir(directory), [daysAgo(30)]);
    });

    test('leaves files and folders it did not create', async () => {
        const directory = await makeBackups(['photos', 'sekai-20261399T000000Z', daysAgo(1)]);
        await writeFile(path.join(directory, 'notes.txt'), 'x');
        await mkdir(path.join(directory, `${daysAgo(80)}.old`));
        const before = (await readdir(directory)).sort();
        assert.deepEqual(await pruneBackups(directory, { retentionDays: 14, now: NOW }), []);
        assert.deepEqual((await readdir(directory)).sort(), before);
    });

    test('does nothing in an empty directory and defaults to the current time', async () => {
        assert.deepEqual(await pruneBackups(await makeBackups([]), { retentionDays: 14 }), []);
    });

    test('does not count a plain file with a backup name as a backup', async () => {
        const directory = await makeBackups([daysAgo(30)]);
        await writeFile(path.join(directory, daysAgo(1)), 'x');
        assert.deepEqual(await pruneBackups(directory, { retentionDays: 14, now: NOW }), []);
        assert.equal(await readFile(path.join(directory, daysAgo(1)), 'utf8'), 'x');
    });
});
