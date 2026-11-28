import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importOptionalDefault } from '../API/optionalModule.ts';

const here = (name) => new URL(name, import.meta.url);

test('returns the default export of a module that exists', async () => {
    const value = await importOptionalDefault(here('../config.js'));
    assert.equal(typeof value.RULES, 'object');
});

test('returns null when the module file does not exist', async () => {
    assert.equal(await importOptionalDefault(here('./no-such-config.js')), null);
});

test('rethrows when a module exists but one of its own imports is missing', async () => {
    const importer = async () => {
        throw Object.assign(new Error("Cannot find module '/x/other-dependency.js'"), { code: 'ERR_MODULE_NOT_FOUND' });
    };
    await assert.rejects(importOptionalDefault(here('./configProd.js'), importer), /other-dependency/);
});

test('rethrows any other loading error', async () => {
    const importer = async () => {
        throw new SyntaxError('Unexpected token');
    };
    await assert.rejects(importOptionalDefault(here('./configProd.js'), importer), SyntaxError);
});
