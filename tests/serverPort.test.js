import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PORT, readPort } from '../API/serverPort.js';

test('defaults to 3000 when PORT is unset or blank', () => {
    assert.equal(readPort(undefined), DEFAULT_PORT);
    assert.equal(readPort('  '), DEFAULT_PORT);
});

test('reads a valid port, including both limits', () => {
    assert.equal(readPort('2019'), 2019);
    assert.equal(readPort('1'), 1);
    assert.equal(readPort('65535'), 65535);
});

for (const value of ['0', '65536', '-1', '80.5', 'http']) {
    test(`refuses PORT=${value}`, () => {
        assert.throws(() => readPort(value), RangeError);
    });
}
