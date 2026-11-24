import path from 'node:path';

export const METRICS = ['lines', 'branches', 'functions', 'statements'];

const missed = ({ total, covered }) => total - covered;

const isCovered = (counts) => METRICS.every((metric) => counts[metric] === 0);

export const measure = (summary, root) => {
    const measured = {};
    for (const [file, metrics] of Object.entries(summary)) {
        if (file === 'total') continue;
        const relative = path.relative(root, file).split(path.sep).join('/');
        measured[relative] = Object.fromEntries(METRICS.map((metric) => [metric, missed(metrics[metric])]));
    }
    return measured;
};

export const compare = (measured, floors) => {
    const problems = [];
    for (const [file, counts] of Object.entries(measured)) {
        const floor = floors[file];
        for (const metric of METRICS) {
            const actual = counts[metric];
            const allowed = floor?.[metric] ?? 0;
            if (actual > allowed) {
                problems.push(
                    floor
                        ? `${file}: uncovered ${metric} rose from ${allowed} to ${actual}`
                        : `${file}: ${actual} uncovered ${metric}; files not listed in the floors must be fully covered`,
                );
            } else if (actual < allowed) {
                problems.push(
                    `${file}: uncovered ${metric} fell from ${allowed} to ${actual}; run npm run coverage:update to lower the cap`,
                );
            }
        }
    }
    for (const file of Object.keys(floors)) {
        if (!(file in measured)) problems.push(`${file}: listed in the floors but no longer measured`);
    }
    return problems;
};

export const lowerFloors = (measured, floors) => {
    const lowered = {};
    for (const file of Object.keys(floors).sort()) {
        const counts = measured[file];
        if (!counts) continue;
        const capped = Object.fromEntries(
            METRICS.map((metric) => [metric, Math.min(counts[metric], floors[file][metric])]),
        );
        if (!isCovered(capped)) lowered[file] = capped;
    }
    return lowered;
};

export const summarise = (measured, floors) => {
    const files = Object.keys(measured);
    const capped = files.filter((file) => file in floors).length;
    return `Coverage gate passed: ${files.length - capped} file(s) fully covered, ${capped} within their caps`;
};
