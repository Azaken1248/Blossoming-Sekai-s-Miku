import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_LIMIT,
    MAX_LIMIT,
    QueryError,
    buildFilter,
    buildSort,
    groupByOf,
    pageOf,
} from '../../Utils/domain/analyticsQuery.ts';

const rejects = (run, message) =>
    assert.throws(
        run,
        (error) =>
            error instanceof QueryError &&
            error.name === 'QueryError' &&
            error.status === 400 &&
            error.message === message,
    );

describe('buildFilter', () => {
    test('keeps only known fields that have a value', () => {
        assert.deepEqual(buildFilter(), {});
        assert.deepEqual(
            buildFilter({ $where: 'sleep(1)', userId: 'x', status: '', roleName: null, taskName: 'in progress' }),
            { taskName: 'in progress' },
        );
    });

    test('converts values to the type of the field', () => {
        assert.deepEqual(
            buildFilter({
                status: 'LATE',
                hasExtended: 'true',
                extensionCount: '2',
                deadline: '2026-01-01T00:00:00Z',
                taskType: 'skit',
            }),
            {
                status: 'LATE',
                hasExtended: true,
                extensionCount: 2,
                deadline: new Date('2026-01-01T00:00:00Z'),
                taskType: 'skit',
            },
        );
        assert.deepEqual(buildFilter({ hasExtended: 'false' }), { hasExtended: false });
    });

    test('refuses values that do not fit the field', () => {
        rejects(() => buildFilter({ status: 'DONE' }), 'status must be one of: PENDING, COMPLETED, LATE, EXCUSED');
        rejects(() => buildFilter({ hasExtended: 'yes' }), 'hasExtended must be true or false');
        rejects(() => buildFilter({ extensionCount: 'many' }), 'extensionCount must be a number');
        rejects(() => buildFilter({ deadline: 'soon' }), 'deadline must be a valid date');
    });

    test('accepts allowed operators and refuses the rest', () => {
        assert.deepEqual(buildFilter({ extensionCount: { gte: '1', lt: '3' }, status: { in: ['LATE', 'PENDING'] } }), {
            extensionCount: { $gte: 1, $lt: 3 },
            status: { $in: ['LATE', 'PENDING'] },
        });
        assert.deepEqual(buildFilter({ deadline: { nin: ['2026-01-01'] } }), {
            deadline: { $nin: [new Date('2026-01-01')] },
        });
        assert.deepEqual(buildFilter({ deadline: {} }), {});
        rejects(() => buildFilter({ taskName: { regex: '.*' } }), 'Operator "regex" is not supported for taskName');
        rejects(() => buildFilter({ status: { in: 'LATE' } }), 'Operator "in" is not supported for status');
        rejects(() => buildFilter({ deadline: { where: '1' } }), 'Operator "where" is not supported for deadline');
    });

    test('knows every filterable field and comparison', () => {
        const day = '2026-01-01';
        assert.deepEqual(
            buildFilter({
                roleName: 'VA',
                roleCategoryId: '1',
                discordUserId: '2',
                assignedAt: { gt: day },
                completedAt: { lte: day },
                deadline: { ne: day },
            }),
            {
                roleName: 'VA',
                roleCategoryId: '1',
                discordUserId: '2',
                assignedAt: { $gt: new Date(day) },
                completedAt: { $lte: new Date(day) },
                deadline: { $ne: new Date(day) },
            },
        );
        rejects(() => buildFilter({ roleName: { gt: 'a' } }), 'Operator "gt" is not supported for roleName');
    });

    test('takes a custom field list', () => {
        assert.deepEqual(buildFilter({ status: 'x', note: 'y' }, { note: { type: 'string' } }), { note: 'y' });
    });
});

describe('buildSort', () => {
    test('sorts newest first by default', () => {
        assert.equal(buildSort(undefined), '-assignedAt');
        assert.equal(buildSort(null), '-assignedAt');
        assert.equal(buildSort(''), '-assignedAt');
        assert.equal(buildSort(' , '), '-assignedAt');
    });
    test('sorts by several fields and maps createdAt to assignedAt', () => {
        assert.equal(buildSort('-createdAt, deadline'), '-assignedAt deadline');
        assert.equal(buildSort(['status', '-roleName']), 'status -roleName');
    });
    test('refuses a field that is not sortable', () => {
        rejects(
            () => buildSort('-password'),
            'Cannot sort by "password". Allowed: assignedAt, deadline, completedAt, status, roleName, taskType, extensionCount',
        );
    });
    test('reads nested lists, objects and numbers the way the query string would print them', () => {
        assert.equal(buildSort([['status', 'deadline'], 'roleName']), 'status deadline roleName');
        const allowed = 'Allowed: assignedAt, deadline, completedAt, status, roleName, taskType, extensionCount';
        rejects(() => buildSort({ a: '1' }), `Cannot sort by "[object Object]". ${allowed}`);
        assert.equal(buildSort([null, undefined]), '-assignedAt');
        rejects(() => buildSort(5), `Cannot sort by "5". ${allowed}`);
        rejects(() => buildSort(true), `Cannot sort by "true". ${allowed}`);
    });
});

describe('pageOf', () => {
    test('bounds the page and the limit', () => {
        const bounds = (query, limit) => {
            const { page, limit: size, skip } = pageOf(query, limit);
            return [page, size, skip];
        };
        assert.deepEqual([DEFAULT_LIMIT, MAX_LIMIT], [100, 200]);
        assert.deepEqual(bounds({ page: '3', limit: '20' }), [3, 20, 40]);
        assert.deepEqual(bounds({ page: '-2', limit: '-5' }), [1, 1, 0]);
        assert.deepEqual(bounds({ page: 'x', limit: 'x' }), [1, 100, 0]);
        assert.deepEqual(bounds({ limit: '200' }), [1, 200, 0]);
        assert.deepEqual(bounds({ limit: '201' }), [1, 200, 0]);
        assert.deepEqual(bounds({}, MAX_LIMIT), [1, 200, 0]);
    });
});

describe('groupByOf', () => {
    test('groups by status unless told otherwise', () => {
        assert.equal(groupByOf({}), 'status');
        assert.equal(groupByOf({ groupBy: 'roleName' }), 'roleName');
    });
    test('refuses anything else', () => {
        const message =
            'groupBy must be one of: status, roleName, roleCategoryId, taskType, discordUserId, hasExtended';
        rejects(() => groupByOf({ groupBy: '$where' }), message);
        rejects(() => groupByOf({ groupBy: ['status', 'roleName'] }), message);
    });
});
