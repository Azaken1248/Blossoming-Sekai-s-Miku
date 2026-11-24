import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { METRICS, compare, lowerFloors, measure, summarise } from '../../tools/coverageGate.js';

const run = promisify(execFile);
const CLI = fileURLToPath(new URL('../../tools/check-coverage.js', import.meta.url));
const ROOT = path.resolve('/repo');

const counts = (lines, branches = lines, functions = lines, statements = lines) => ({
    lines,
    branches,
    functions,
    statements,
});

const metric = (total, covered) => ({ total, covered, skipped: 0, pct: total ? (covered / total) * 100 : 100 });

const summaryEntry = (missedLines, missedBranches = 0) => ({
    lines: metric(10, 10 - missedLines),
    branches: metric(4, 4 - missedBranches),
    functions: metric(2, 2),
    statements: metric(10, 10 - missedLines),
});

describe('measure', () => {
    test('turns a c8 summary into uncovered counts by repo-relative path', () => {
        const summary = {
            total: summaryEntry(9, 9),
            [path.join(ROOT, 'bot.js')]: summaryEntry(2, 1),
            [path.join(ROOT, 'API', 'app.js')]: summaryEntry(0),
        };
        assert.deepEqual(METRICS, ['lines', 'branches', 'functions', 'statements']);
        assert.deepEqual(measure(summary, ROOT), {
            'bot.js': counts(2, 1, 0, 2),
            'API/app.js': counts(0),
        });
    });
});

describe('compare', () => {
    test('passes when every listed file matches its cap and the rest are fully covered', () => {
        assert.deepEqual(compare({ 'a.js': counts(2), 'b.js': counts(0) }, { 'a.js': counts(2) }), []);
    });

    test('fails a file that is not listed and has anything uncovered', () => {
        assert.deepEqual(compare({ 'new.js': counts(0, 1, 0, 0) }, {}), [
            'new.js: 1 uncovered branches; files not listed in the floors must be fully covered',
        ]);
    });

    test('fails a listed file whose uncovered count rose', () => {
        assert.deepEqual(compare({ 'a.js': counts(3, 2, 2, 2) }, { 'a.js': counts(2) }), [
            'a.js: uncovered lines rose from 2 to 3',
        ]);
    });

    test('fails a listed file whose uncovered count fell, so the cap is lowered', () => {
        assert.deepEqual(compare({ 'a.js': counts(2, 1, 2, 2) }, { 'a.js': counts(2) }), [
            'a.js: uncovered branches fell from 2 to 1; run npm run coverage:update to lower the cap',
        ]);
    });

    test('fails a cap for a file that is no longer measured', () => {
        assert.deepEqual(compare({}, { 'gone.js': counts(1) }), [
            'gone.js: listed in the floors but no longer measured',
        ]);
    });
});

describe('lowerFloors', () => {
    test('lowers caps to the measured counts but never raises them', () => {
        assert.deepEqual(
            lowerFloors({ 'a.js': counts(1, 5, 0, 1), 'b.js': counts(3) }, { 'a.js': counts(2), 'b.js': counts(3) }),
            {
                'a.js': counts(1, 2, 0, 1),
                'b.js': counts(3),
            },
        );
    });

    test('drops files that became fully covered or disappeared, and never adds new ones', () => {
        assert.deepEqual(
            lowerFloors({ 'done.js': counts(0), 'new.js': counts(4) }, { 'done.js': counts(2), 'gone.js': counts(1) }),
            {},
        );
    });

    test('sorts files by path', () => {
        const lowered = lowerFloors({ 'b.js': counts(1), 'a.js': counts(1) }, { 'b.js': counts(1), 'a.js': counts(1) });
        assert.deepEqual(Object.keys(lowered), ['a.js', 'b.js']);
    });
});

describe('summarise', () => {
    test('counts fully covered and capped files', () => {
        assert.equal(
            summarise({ 'a.js': counts(0), 'b.js': counts(1) }, { 'b.js': counts(1) }),
            'Coverage gate passed: 1 file(s) fully covered, 1 within their caps',
        );
    });
});

describe('check-coverage command', () => {
    const setUp = async (build) => {
        const directory = await mkdtemp(path.join(tmpdir(), 'coverage-gate-'));
        const at = (file) => path.join(directory, file);
        const { summary, floors } = build(at);
        const files = { summary: at('summary.json'), floors: at('floors.json') };
        await writeFile(files.summary, JSON.stringify(summary));
        await writeFile(files.floors, JSON.stringify(floors));
        return { files, args: [CLI, '--summary', files.summary, '--floors', files.floors, '--root', directory] };
    };

    test('prints a summary and exits 0 when the gate passes', async () => {
        const { args } = await setUp((at) => ({ summary: { [at('a.js')]: summaryEntry(0) }, floors: {} }));
        const { stdout } = await run(process.execPath, args);
        assert.equal(stdout.trim(), 'Coverage gate passed: 1 file(s) fully covered, 0 within their caps');
    });

    test('lists every problem and exits 1 when the gate fails', async () => {
        const { args } = await setUp((at) => ({ summary: { [at('a.js')]: summaryEntry(1) }, floors: {} }));
        await assert.rejects(run(process.execPath, args), (error) => {
            assert.equal(error.code, 1);
            assert.match(error.stderr, /^Coverage gate failed:\n {2}- a\.js: 1 uncovered lines;/);
            return true;
        });
    });

    test('--update lowers the caps on disk and then passes', async () => {
        const { files, args } = await setUp((at) => ({
            summary: { [at('a.js')]: summaryEntry(1), [at('b.js')]: summaryEntry(0) },
            floors: { 'a.js': counts(3), 'b.js': counts(2) },
        }));
        const { stdout } = await run(process.execPath, [...args, '--update']);
        assert.equal(stdout.trim(), 'Coverage gate passed: 1 file(s) fully covered, 1 within their caps');
        assert.equal(
            await readFile(files.floors, 'utf8'),
            `${JSON.stringify({ 'a.js': counts(1, 0, 0, 1) }, null, 2)}\n`,
        );
    });

    test('reads the default paths from the working directory', async () => {
        const directory = await mkdtemp(path.join(tmpdir(), 'coverage-gate-'));
        await mkdir(path.join(directory, 'coverage'));
        await writeFile(path.join(directory, 'coverage-floors.json'), '{}');
        await writeFile(
            path.join(directory, 'coverage', 'coverage-summary.json'),
            JSON.stringify({ [path.join(directory, 'a.js')]: summaryEntry(0) }),
        );
        const { stdout } = await run(process.execPath, [CLI], { cwd: directory });
        assert.equal(stdout.trim(), 'Coverage gate passed: 1 file(s) fully covered, 0 within their caps');
    });
});
