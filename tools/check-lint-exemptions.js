import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ESLint } from 'eslint';
import { compare, measure, tighten } from './lintExemptions.js';

const { values } = parseArgs({
    options: {
        exemptions: { type: 'string', default: 'lint-exemptions.json' },
        root: { type: 'string', default: process.cwd() },
        update: { type: 'boolean', default: false },
    },
});

const root = path.resolve(values.root);
let exemptions = JSON.parse(await readFile(values.exemptions, 'utf8'));
process.env['LINT_EXEMPTIONS'] = 'ignore';
const eslint = new ESLint({ cwd: root, errorOnUnmatchedPattern: false });
const results = await eslint.lintFiles(Object.keys(exemptions));
const measured = measure(results, root);

if (values.update) {
    exemptions = tighten(measured, exemptions);
    await writeFile(values.exemptions, `${JSON.stringify(exemptions, null, 2)}\n`);
}

const problems = compare(measured, exemptions);
if (problems.length > 0) {
    console.error(`Lint exemptions out of date:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    process.exitCode = 1;
} else {
    console.log(
        `Lint exemptions: ${Object.keys(exemptions).length} file(s), all still needed and at their measured size`,
    );
}
