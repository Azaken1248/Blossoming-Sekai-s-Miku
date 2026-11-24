import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoleNames } from '../API/roleNames.js';

const entries = (...configs) => [...buildRoleNames(...configs)];

test('names roles by id, showing underscores as spaces', () => {
    assert.deepEqual(entries({ RULES: { 1: { name: 'Lead_Video_Editor' }, 2: { name: 'VA' } } }), [
        ['1', 'Lead Video Editor'],
        ['2', 'VA'],
    ]);
});

test('keeps the first name when two configs name the same role', () => {
    assert.deepEqual(
        entries({ RULES: { 1: { name: 'First' } } }, { RULES: { 1: { name: 'Second' }, 2: { name: 'B' } } }),
        [
            ['1', 'First'],
            ['2', 'B'],
        ],
    );
});

test('ignores missing configs, configs without rules, and rules without a name', () => {
    assert.deepEqual(entries(null, undefined, {}, { RULES: { 1: null, 2: {}, 3: { name: '' }, 4: { name: 'D' } } }), [
        ['4', 'D'],
    ]);
    assert.deepEqual(entries(), []);
});
