import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_STRIKES, formatStrikes, shouldDemote } from '../../Utils/domain/strikes.js';

test('demotes from the limit upwards, including numeric strings', () => {
    assert.equal(MAX_STRIKES, 3);
    assert.deepEqual([0, 2, 3, 4, '3'].map(shouldDemote), [false, false, true, true, true]);
});

test('formats a count against the limit, treating a missing count as zero', () => {
    assert.deepEqual([0, 2, null, undefined].map(formatStrikes), ['0/3', '2/3', '0/3', '0/3']);
});
