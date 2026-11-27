import path from 'node:path';

export const SIZE_RULES = {
    'max-lines': 400,
    'max-lines-per-function': 50,
};

export const LAYER_RULE = 'no-restricted-imports';

const sizeOf = (message) => Number(message.message.match(/\((\d+)\)/)?.[1]);

export const measure = (results, root) => {
    const measured = {};
    for (const { filePath, messages } of results) {
        const relative = path.relative(root, filePath).split(path.sep).join('/');
        const found = {};
        for (const message of messages) {
            if (message.ruleId === LAYER_RULE) found[LAYER_RULE] = true;
            if (message.ruleId in SIZE_RULES)
                found[message.ruleId] = Math.max(found[message.ruleId] ?? 0, sizeOf(message));
        }
        measured[relative] = found;
    }
    return measured;
};

export const compare = (measured, exemptions) => {
    const problems = [];
    for (const [file, rules] of Object.entries(exemptions)) {
        const actual = measured[file];
        if (!actual) {
            problems.push(`${file}: listed in the exemptions but no longer exists`);
            continue;
        }
        for (const [rule, allowed] of Object.entries(rules)) {
            const now = actual[rule];
            if (now === undefined) {
                problems.push(`${file}: now meets ${rule}; run npm run lint:update to remove the exemption`);
            } else if (now !== true && now < allowed) {
                problems.push(`${file}: ${rule} fell from ${allowed} to ${now}; run npm run lint:update to lower it`);
            }
        }
    }
    return problems;
};

export const tighten = (measured, exemptions) => {
    const tightened = {};
    for (const file of Object.keys(exemptions).sort()) {
        const kept = Object.fromEntries(
            Object.entries(exemptions[file])
                .filter(([rule]) => measured[file]?.[rule] !== undefined)
                .map(([rule, allowed]) => [rule, allowed === true ? true : Math.min(allowed, measured[file][rule])]),
        );
        if (Object.keys(kept).length > 0) tightened[file] = kept;
    }
    return tightened;
};

export const overrides = (exemptions) =>
    Object.entries(exemptions).map(([file, rules]) => ({
        files: [file],
        rules: Object.fromEntries(
            Object.entries(rules).map(([rule, allowed]) => [
                rule,
                allowed === true ? 'off' : ['error', { max: allowed }],
            ]),
        ),
    }));
