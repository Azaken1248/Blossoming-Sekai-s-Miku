import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { LAYER_RULE, SIZE_RULES, compare, measure, overrides, tighten } from '../../tools/lintExemptions.js';

const run = promisify(execFile);
const CLI = fileURLToPath(new URL('../../tools/check-lint-exemptions.js', import.meta.url));
const ROOT = path.resolve('/repo');

const message = (ruleId, size) => ({
    ruleId,
    message:
        size === undefined ? 'Import is restricted.' : `Function has too many lines (${size}). Maximum allowed is 1.`,
});

describe('measure', () => {
    test('keeps the largest size per rule and notes layering breaks, by repo-relative path', () => {
        const results = [
            {
                filePath: path.join(ROOT, 'API', 'app.js'),
                messages: [
                    message('max-lines-per-function', 60),
                    message('max-lines-per-function', 71),
                    message('max-lines', 450),
                    message(LAYER_RULE),
                    message('no-console', 3),
                    { ruleId: null, message: 'Parsing error' },
                ],
            },
            { filePath: path.join(ROOT, 'bot.js'), messages: [] },
        ];
        assert.deepEqual(SIZE_RULES, { 'max-lines': 400, 'max-lines-per-function': 50 });
        assert.deepEqual(measure(results, ROOT), {
            'API/app.js': { 'max-lines-per-function': 71, 'max-lines': 450, [LAYER_RULE]: true },
            'bot.js': {},
        });
    });
});

describe('compare', () => {
    test('passes when every exemption is still needed at its recorded size', () => {
        assert.deepEqual(
            compare(
                { 'a.js': { 'max-lines': 500, [LAYER_RULE]: true } },
                { 'a.js': { 'max-lines': 500, [LAYER_RULE]: true } },
            ),
            [],
        );
    });

    test('asks for an exemption to be lowered or removed once the file improves', () => {
        assert.deepEqual(
            compare(
                { 'a.js': { 'max-lines': 450 }, 'b.js': {} },
                {
                    'a.js': { 'max-lines': 500, [LAYER_RULE]: true },
                    'b.js': { 'max-lines-per-function': 60 },
                    'gone.js': { 'max-lines': 401 },
                },
            ),
            [
                'a.js: max-lines fell from 500 to 450; run npm run lint:update to lower it',
                `a.js: now meets ${LAYER_RULE}; run npm run lint:update to remove the exemption`,
                'b.js: now meets max-lines-per-function; run npm run lint:update to remove the exemption',
                'gone.js: listed in the exemptions but no longer exists',
            ],
        );
    });
});

describe('tighten', () => {
    test('lowers sizes, drops rules and files that now pass, and never adds', () => {
        assert.deepEqual(
            tighten(
                { 'b.js': { 'max-lines': 450, [LAYER_RULE]: true }, 'a.js': {}, 'new.js': { 'max-lines': 900 } },
                {
                    'b.js': { 'max-lines': 500, 'max-lines-per-function': 60, [LAYER_RULE]: true },
                    'a.js': { 'max-lines': 401 },
                    'gone.js': { 'max-lines': 401 },
                },
            ),
            { 'b.js': { 'max-lines': 450, [LAYER_RULE]: true } },
        );
    });
});

describe('overrides', () => {
    test('raises each size limit to the recorded size and turns layering off for the file', () => {
        assert.deepEqual(overrides({ 'a.js': { 'max-lines': 500, [LAYER_RULE]: true } }), [
            { files: ['a.js'], rules: { 'max-lines': ['error', { max: 500 }], [LAYER_RULE]: 'off' } },
        ]);
    });
});

describe('check-lint-exemptions command', () => {
    const CONFIG = `export default [{ rules: {
    'max-lines': ['error', { max: 3 }],
    'max-lines-per-function': ['error', { max: 3 }],
    '${LAYER_RULE}': ['error', { patterns: [{ regex: '^banned$' }] }],
} }];
`;
    const LONG = 'export const f = () => {\n    const a = 1;\n    const b = 2;\n    return a + b;\n};\n';

    const setUp = async (exemptions) => {
        const directory = await mkdtemp(path.join(tmpdir(), 'lint-exemptions-'));
        await writeFile(path.join(directory, 'eslint.config.js'), CONFIG);
        await writeFile(path.join(directory, 'long.js'), LONG);
        await writeFile(path.join(directory, 'short.js'), 'export const g = 1;\n');
        const file = path.join(directory, 'exemptions.json');
        await writeFile(file, JSON.stringify(exemptions));
        return { file, args: [CLI, '--root', directory, '--exemptions', file] };
    };

    test('passes when the list matches what lint measures', async () => {
        const { args } = await setUp({ 'long.js': { 'max-lines': 5, 'max-lines-per-function': 5 } });
        const { stdout } = await run(process.execPath, args);
        assert.equal(stdout.trim(), 'Lint exemptions: 1 file(s), all still needed and at their measured size');
    });

    test('fails and lists every exemption that is out of date', async () => {
        const { args } = await setUp({ 'long.js': { 'max-lines': 9 }, 'short.js': { 'max-lines': 9 } });
        await assert.rejects(run(process.execPath, args), (error) => {
            assert.equal(error.code, 1);
            assert.equal(
                error.stderr,
                'Lint exemptions out of date:\n' +
                    '  - long.js: max-lines fell from 9 to 5; run npm run lint:update to lower it\n' +
                    '  - short.js: now meets max-lines; run npm run lint:update to remove the exemption\n',
            );
            return true;
        });
    });

    test('--update writes the tightened list and then passes', async () => {
        const { file, args } = await setUp({
            'long.js': { 'max-lines': 9, [LAYER_RULE]: true },
            'short.js': { 'max-lines': 9 },
        });
        await run(process.execPath, [...args, '--update']);
        assert.equal(await readFile(file, 'utf8'), `${JSON.stringify({ 'long.js': { 'max-lines': 5 } }, null, 2)}\n`);
    });

    test('reads lint-exemptions.json from the working directory by default', async () => {
        const { args } = await setUp({});
        const directory = args[2];
        await writeFile(path.join(directory, 'lint-exemptions.json'), '{}');
        const { stdout } = await run(process.execPath, [CLI], { cwd: directory });
        assert.equal(stdout.trim(), 'Lint exemptions: 0 file(s), all still needed and at their measured size');
    });
});
