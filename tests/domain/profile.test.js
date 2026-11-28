import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickRoles, tallyTasks } from '../../Utils/domain/profile.ts';

test('counts completed tasks and ranks roles by how often they appear', () => {
    const tasks = [
        { status: 'COMPLETED', roleName: 'VA' },
        { status: 'PENDING', roleName: 'mixer' },
        { status: 'COMPLETED', roleName: 'mixer' },
        { status: 'LATE' },
        { status: 'PENDING', roleName: 'mixer' },
        { status: 'PENDING', roleName: '' },
    ];
    assert.deepEqual(tallyTasks(tasks, 2), { tasksCompleted: 2, topTaskRoles: ['mixer', 'Unknown'] });
    assert.deepEqual(tallyTasks(tasks, 3).topTaskRoles, ['mixer', 'Unknown', 'VA']);
    assert.deepEqual(tallyTasks([], 3), { tasksCompleted: 0, topTaskRoles: [] });
});

test('keeps the first role seen when counts tie', () => {
    assert.deepEqual(tallyTasks([{ roleName: 'b' }, { roleName: 'a' }], 1).topTaskRoles, ['b']);
});

test('prefers guild roles, then stored roles, then task roles', () => {
    assert.deepEqual(pickRoles(['g'], ['s'], ['t']), ['g']);
    assert.deepEqual(pickRoles([], ['s'], ['t']), ['s']);
    assert.deepEqual(pickRoles([], [], ['t']), ['t']);
});
