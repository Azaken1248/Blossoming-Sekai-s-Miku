import { test } from 'node:test';
import assert from 'node:assert/strict';
import { containsText, SearchTooLongError, MAX_SEARCH_LENGTH } from '../Utils/DBUtils/searchPattern.ts';

const toRegExp = ({ $regex, $options }) => new RegExp($regex, $options);

test('matches plain text case-insensitively anywhere in the value', () => {
    const pattern = toRegExp(containsText('Miku'));
    assert.ok(pattern.test('hatsune miku'));
    assert.ok(pattern.test('MIKU fan'));
    assert.ok(!pattern.test('rin'));
});

test('treats a dot as a literal dot', () => {
    const pattern = toRegExp(containsText('a.b'));
    assert.ok(pattern.test('a.b'));
    assert.ok(!pattern.test('axb'));
});

test('treats every regex metacharacter literally', () => {
    const input = '.*+?^${}()|[]\\';
    const pattern = toRegExp(containsText(input));
    assert.ok(pattern.test(`before ${input} after`));
    assert.ok(!pattern.test('anything else'));
});

test('neutralises a catastrophic backtracking pattern', () => {
    const pattern = toRegExp(containsText('(a+)+$'));
    const started = process.hrtime.bigint();
    assert.ok(!pattern.test(`${'a'.repeat(40)}!`));
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    assert.ok(elapsedMs < 50, `took ${elapsedMs} ms`);
    assert.ok(pattern.test('literal (a+)+$ text'));
});

test('accepts text up to the maximum length', () => {
    assert.doesNotThrow(() => containsText('x'.repeat(MAX_SEARCH_LENGTH)));
});

test('refuses text over the maximum length', () => {
    assert.throws(() => containsText('x'.repeat(MAX_SEARCH_LENGTH + 1)), SearchTooLongError);
});

test('honours a custom maximum length', () => {
    assert.throws(
        () => containsText('abcd', 3),
        (error) => error instanceof SearchTooLongError && error.maxLength === 3,
    );
});

test('converts non-string input to text', () => {
    const pattern = toRegExp(containsText(12345));
    assert.ok(pattern.test('id 12345'));
});
