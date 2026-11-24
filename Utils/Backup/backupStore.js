import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable, pipeline as pipelineCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';
import mongoose from 'mongoose';

const { EJSON } = mongoose.mongo.BSON;

export const FORMAT_VERSION = 1;
export const MANIFEST_FILE = 'manifest.json';
export const INSERT_BATCH_SIZE = 1000;
const PARTIAL_SUFFIX = '.partial';
const BACKUP_NAME_PATTERN = /^sekai-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z(\.partial)?$/;
const DATA_FILE_PATTERN = /^\d{4}\.ejson\.gz$/;
const DAY_MS = 86_400_000;
const PRIVATE_DIRECTORY = 0o700;
const PRIVATE_FILE = 0o600;

export class BackupFormatError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BackupFormatError';
    }
}

export class RestoreTargetInUseError extends Error {
    constructor(collections) {
        super(`Target database already has: ${collections.join(', ')}`);
        this.name = 'RestoreTargetInUseError';
        this.collections = collections;
    }
}

export const backupName = (date) =>
    `sekai-${date
        .toISOString()
        .replace(/\.\d{3}/, '')
        .replace(/[-:]/g, '')}`;

export const parseBackupName = (name) => {
    const match = BACKUP_NAME_PATTERN.exec(name);
    if (!match) {
        return null;
    }
    const [, year, month, day, hour, minute, second, partial] = match;
    const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return { date, partial: partial !== undefined };
};

const dataFileName = (index) => `${String(index + 1).padStart(4, '0')}.ejson.gz`;

const indexSpecs = async (collection) => {
    const indexes = await collection.indexes();
    return indexes.filter((index) => index.name !== '_id_').map(({ v, ns, ...spec }) => spec);
};

const writeDocuments = async (collection, file) => {
    let count = 0;
    const lines = Readable.from(
        (async function* () {
            for await (const document of collection.find({})) {
                count += 1;
                yield `${EJSON.stringify(document, { relaxed: false })}\n`;
            }
        })(),
    );
    await pipeline(lines, createGzip(), createWriteStream(file, { mode: PRIVATE_FILE }));
    return count;
};

async function* readLines(file) {
    const input = pipelineCallback(createReadStream(file), createGunzip(), () => {});
    input.setEncoding('utf8');
    let rest = '';
    for await (const chunk of input) {
        const parts = (rest + chunk).split('\n');
        rest = parts.pop();
        yield* parts;
    }
    if (rest) {
        yield rest;
    }
}

async function* readDocuments(file) {
    for await (const line of readLines(file)) {
        try {
            yield EJSON.parse(line, { relaxed: false });
        } catch {
            throw new BackupFormatError(`${path.basename(file)} has a line that is not valid EJSON`);
        }
    }
}

export const createBackup = async (db, { directory, now = new Date() }) => {
    await mkdir(directory, { recursive: true, mode: PRIVATE_DIRECTORY });
    const finalPath = path.join(directory, backupName(now));
    const partialPath = `${finalPath}${PARTIAL_SUFFIX}`;
    await rm(partialPath, { recursive: true, force: true });
    await mkdir(partialPath, { mode: PRIVATE_DIRECTORY });
    try {
        const listed = await db.listCollections({ type: 'collection' }, { nameOnly: true }).toArray();
        const names = listed
            .map(({ name }) => name)
            .filter((name) => !name.startsWith('system.'))
            .sort();
        const collections = [];
        for (const [index, name] of names.entries()) {
            const collection = db.collection(name);
            const file = dataFileName(index);
            const indexes = await indexSpecs(collection);
            const count = await writeDocuments(collection, path.join(partialPath, file));
            collections.push({ name, file, count, indexes });
        }
        const manifest = {
            formatVersion: FORMAT_VERSION,
            database: db.databaseName,
            createdAt: now.toISOString(),
            collections,
        };
        await writeFile(path.join(partialPath, MANIFEST_FILE), JSON.stringify(manifest, null, 2), {
            mode: PRIVATE_FILE,
        });
        await rename(partialPath, finalPath);
        return { path: finalPath, manifest };
    } catch (error) {
        await rm(partialPath, { recursive: true, force: true });
        throw error;
    }
};

const isValidEntry = (entry) =>
    typeof entry?.name === 'string' &&
    entry.name.length > 0 &&
    typeof entry.file === 'string' &&
    DATA_FILE_PATTERN.test(entry.file) &&
    Number.isInteger(entry.count) &&
    entry.count >= 0 &&
    Array.isArray(entry.indexes);

export const readManifest = async (backupPath) => {
    let manifest;
    try {
        manifest = JSON.parse(await readFile(path.join(backupPath, MANIFEST_FILE), 'utf8'));
    } catch (error) {
        throw new BackupFormatError(`Cannot read ${MANIFEST_FILE}: ${error.message}`);
    }
    if (manifest?.formatVersion !== FORMAT_VERSION) {
        throw new BackupFormatError(`Unsupported backup format version: ${manifest?.formatVersion}`);
    }
    if (!Array.isArray(manifest.collections) || !manifest.collections.every(isValidEntry)) {
        throw new BackupFormatError(`${MANIFEST_FILE} has an invalid collection list`);
    }
    return manifest;
};

const checkCount = (entry, count) => {
    if (count !== entry.count) {
        throw new BackupFormatError(`${entry.name}: manifest says ${entry.count} documents, file has ${count}`);
    }
};

export const verifyBackup = async (backupPath) => {
    const manifest = await readManifest(backupPath);
    const collections = [];
    for (const entry of manifest.collections) {
        let count = 0;
        for await (const _document of readDocuments(path.join(backupPath, entry.file))) {
            count += 1;
        }
        checkCount(entry, count);
        collections.push({ name: entry.name, count });
    }
    return collections;
};

const insertDocuments = async (collection, file) => {
    let batch = [];
    let count = 0;
    for await (const document of readDocuments(file)) {
        batch.push(document);
        if (batch.length === INSERT_BATCH_SIZE) {
            await collection.insertMany(batch);
            count += batch.length;
            batch = [];
        }
    }
    if (batch.length > 0) {
        await collection.insertMany(batch);
        count += batch.length;
    }
    return count;
};

export const restoreBackup = async (db, backupPath) => {
    const manifest = await readManifest(backupPath);
    const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name));
    const clashes = manifest.collections.map(({ name }) => name).filter((name) => existing.has(name));
    if (clashes.length > 0) {
        throw new RestoreTargetInUseError(clashes);
    }
    const collections = [];
    for (const entry of manifest.collections) {
        const collection = await db.createCollection(entry.name);
        const count = await insertDocuments(collection, path.join(backupPath, entry.file));
        checkCount(entry, count);
        if (entry.indexes.length > 0) {
            await collection.createIndexes(entry.indexes);
        }
        collections.push({ name: entry.name, count });
    }
    return collections;
};

export const pruneBackups = async (directory, { retentionDays, now = new Date() }) => {
    const entries = await readdir(directory, { withFileTypes: true });
    const backups = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({ name: entry.name, parsed: parseBackupName(entry.name) }))
        .filter(({ parsed }) => parsed !== null)
        .sort((a, b) => b.parsed.date - a.parsed.date);
    const newestComplete = backups.find(({ parsed }) => !parsed.partial);
    const cutoff = now.getTime() - retentionDays * DAY_MS;
    const expired = backups.filter((backup) => backup !== newestComplete && backup.parsed.date.getTime() < cutoff);
    for (const { name } of expired) {
        await rm(path.join(directory, name), { recursive: true, force: true });
    }
    return expired.map(({ name }) => name);
};
