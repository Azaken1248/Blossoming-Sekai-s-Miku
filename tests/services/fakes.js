import assert from 'node:assert/strict';
import { WEEK } from '../../Utils/domain/durations.ts';

export const NOW = new Date('2026-06-15T12:00:00.000Z');
export const at = (offset) => new Date(NOW.getTime() + offset);
export const clock = { now: () => NOW };
export const RULES = {
    va: { name: 'VA', tasks: { skit: 2 * WEEK }, extension: WEEK },
    bare: { name: 'Bare', tasks: {} },
};

export const fakes = (answers = {}) => {
    const calls = [];
    const port = new Proxy(
        {},
        {
            get: (_target, name) =>
                Object.hasOwn(answers, name)
                    ? async (...args) => {
                          calls.push([name, ...args]);
                          const answer = answers[name];
                          return typeof answer === 'function' ? answer(...args) : answer;
                      }
                    : undefined,
        },
    );
    return { port, calls };
};

export const task = (id, extra = {}) => ({
    id,
    taskName: '',
    taskType: 'skit',
    roleName: 'VA',
    roleCategoryId: 'va',
    status: 'PENDING',
    hasExtended: false,
    extensionCount: 0,
    customExtension: null,
    ...extra,
});
export const member = (extra = {}) => ({
    id: 'm1',
    discordId: '1',
    username: 'one',
    strikes: 1,
    isOnHiatus: false,
    isDeboarded: false,
    deboardedMessage: 'Bye',
    ...extra,
});
export const profile = (...assignments) => member({ assignments });

export const refuses = (promise, code, details) =>
    assert.rejects(promise, (error) => {
        assert.deepEqual([error.name, error.code, error.details], ['DomainError', code, details]);
        return true;
    });
