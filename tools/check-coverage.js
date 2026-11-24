import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { compare, lowerFloors, measure, summarise } from './coverageGate.js';

const { values } = parseArgs({
    options: {
        summary: { type: 'string', default: 'coverage/coverage-summary.json' },
        floors: { type: 'string', default: 'coverage-floors.json' },
        root: { type: 'string', default: process.cwd() },
        update: { type: 'boolean', default: false },
    },
});

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

const measured = measure(await readJson(values.summary), path.resolve(values.root));
let floors = await readJson(values.floors);

if (values.update) {
    floors = lowerFloors(measured, floors);
    await writeFile(values.floors, `${JSON.stringify(floors, null, 2)}\n`);
}

const problems = compare(measured, floors);
if (problems.length > 0) {
    console.error(`Coverage gate failed:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    process.exitCode = 1;
} else {
    console.log(summarise(measured, floors));
}
