import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ConfigError,
    MAX_EXTENSIONS_PER_TASK,
    canExtend,
    countExtensionsUsed,
    msToDays,
    resolveExtensionMs,
} from '../../Utils/domain/extensions.ts';

const DAY = 24 * 60 * 60 * 1000;
const config = {
    RULES: {
        flat: { name: 'Flat', extension: 3 * DAY },
        split: { name: 'Split', extension_skit: 2 * DAY, extension_story: 4 * DAY, extension_mv: 7 * DAY },
        bare: { name: 'Bare' },
    },
};

test('counts extensions, reading legacy rows that only set hasExtended as one', () => {
    assert.equal(MAX_EXTENSIONS_PER_TASK, 2);
    assert.deepEqual(
        [
            {},
            { hasExtended: true, extensionCount: 0 },
            { hasExtended: true, extensionCount: 2 },
            { hasExtended: false, extensionCount: 1 },
        ].map(countExtensionsUsed),
        [0, 1, 2, 1],
    );
    assert.deepEqual([{ extensionCount: 1 }, { extensionCount: 2 }].map(canExtend), [true, false]);
});

test('prefers the task custom extension, then the flat role extension', () => {
    assert.equal(resolveExtensionMs({ customExtension: DAY, roleCategoryId: 'flat' }, config), DAY);
    assert.equal(resolveExtensionMs({ roleCategoryId: 'flat', taskType: 'skit' }, config), 3 * DAY);
});

test('falls back to the window for the task type', () => {
    const resolve = (taskType) => resolveExtensionMs({ roleCategoryId: 'split', taskType }, config);
    assert.deepEqual(['short_skit', 'story', 'color_mv', undefined].map(resolve), [2 * DAY, 4 * DAY, 7 * DAY, 7 * DAY]);
});

test('throws a ConfigError for an unknown role or a role with no window', () => {
    assert.throws(() => resolveExtensionMs({ roleCategoryId: 'gone' }, config), {
        name: 'ConfigError',
        code: 'CONFIG_MISSING_ROLE',
        message: 'Role category gone is not present in config.RULES',
    });
    assert.throws(
        () => resolveExtensionMs({ roleCategoryId: 'bare', taskType: null }, config),
        (error) =>
            error instanceof ConfigError &&
            error.message === 'Role Bare (bare) defines no extension window for task type ""',
    );
});

test('converts milliseconds to whole days, rounding down', () => {
    assert.deepEqual([0, DAY - 1, DAY, 3.5 * DAY].map(msToDays), [0, 0, 1, 3]);
});
