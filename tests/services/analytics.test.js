import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnalyticsService } from '../../Services/analyticsService.ts';

const recording = () => {
    const calls = [];
    const records = {
        findAssignments: async (query) => {
            calls.push(['findAssignments', query]);
            return ['task'];
        },
        pageMembers: async (query) => {
            calls.push(['pageMembers', query]);
            return [['member'], 7];
        },
        groupAssignments: async (match, field) => {
            calls.push(['groupAssignments', match, field]);
            return ['group'];
        },
    };
    return { calls, service: createAnalyticsService({ records }) };
};

test('assignments are filtered, sorted and paged', async () => {
    const { calls, service } = recording();
    const result = await service.assignments({ status: 'LATE', sort: 'deadline', page: '2', limit: '5' });
    assert.deepEqual(result, { page: 2, limit: 5, data: ['task'] });
    assert.deepEqual(calls, [['findAssignments', { filter: { status: 'LATE' }, sort: 'deadline', skip: 5, limit: 5 }]]);
});

test('members are paged two hundred at a time by default', async () => {
    const { calls, service } = recording();
    assert.deepEqual(await service.members({}), { page: 1, limit: 200, total: 7, data: ['member'] });
    assert.deepEqual(calls, [['pageMembers', { skip: 0, limit: 200 }]]);
});

test('stats are grouped by the asked field within the filter', async () => {
    const { calls, service } = recording();
    assert.deepEqual(await service.stats({ groupBy: 'roleName', taskType: 'skit' }), {
        groupBy: 'roleName',
        data: ['group'],
    });
    assert.deepEqual(calls, [['groupAssignments', { taskType: 'skit' }, 'roleName']]);
});
