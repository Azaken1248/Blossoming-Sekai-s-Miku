import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_HOST, DEFAULT_PORT, describeAddress, readHost, readPort } from '../API/serverAddress.js';

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

test('listens on the loopback address only when HOST is unset or blank', () => {
    assert.equal(DEFAULT_HOST, '127.0.0.1');
    assert.equal(readHost(undefined), '127.0.0.1');
    assert.equal(readHost('   '), '127.0.0.1');
});

test('reads an IPv4 or IPv6 address, or localhost, trimming spaces', () => {
    assert.equal(readHost('0.0.0.0'), '0.0.0.0');
    assert.equal(readHost(' 192.168.1.20 '), '192.168.1.20');
    assert.equal(readHost('::'), '::');
    assert.equal(readHost('::1'), '::1');
    assert.equal(readHost('localhost'), 'localhost');
});

for (const value of ['example.com', '256.1.1.1', 'http://127.0.0.1', '127.0.0.1:2019', '[::1]']) {
    test(`refuses HOST=${value}`, () => {
        assert.throws(() => readHost(value), {
            name: 'RangeError',
            message: `HOST must be an IP address or localhost, got "${value}"`,
        });
    });
}

test('formats the listening address, bracketing IPv6', () => {
    assert.equal(describeAddress('127.0.0.1', 2019), 'http://127.0.0.1:2019');
    assert.equal(describeAddress('localhost', 3000), 'http://localhost:3000');
    assert.equal(describeAddress('::1', 2019), 'http://[::1]:2019');
});
