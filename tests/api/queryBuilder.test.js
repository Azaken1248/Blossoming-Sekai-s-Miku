import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import QueryBuilder, { DEFAULT_LIMIT, MAX_LIMIT, QueryError, buildFilter } from '../../API/utils/queryBuilder.js';

const recorder = () => {
    const calls = [];
    const query = { calls };
    for (const name of ['find', 'sort', 'skip', 'limit']) {
        query[name] = (value) => {
            calls.push([name, value]);
            return query;
        };
    }
    return query;
};

const rejects = (query, message) =>
    assert.throws(
        () => buildFilter(query),
        (error) => error instanceof QueryError && error.status === 400 && error.message === message,
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
        rejects({ status: 'DONE' }, 'status must be one of: PENDING, COMPLETED, LATE, EXCUSED');
        rejects({ hasExtended: 'yes' }, 'hasExtended must be true or false');
        rejects({ extensionCount: 'many' }, 'extensionCount must be a number');
        rejects({ deadline: 'soon' }, 'deadline must be a valid date');
    });

    test('accepts allowed operators and refuses the rest', () => {
        assert.deepEqual(buildFilter({ extensionCount: { gte: '1', lt: '3' }, status: { in: ['LATE', 'PENDING'] } }), {
            extensionCount: { $gte: 1, $lt: 3 },
            status: { $in: ['LATE', 'PENDING'] },
        });
        assert.deepEqual(buildFilter({ deadline: {} }), {});
        rejects({ taskName: { regex: '.*' } }, 'Operator "regex" is not supported for taskName');
        rejects({ status: { in: 'LATE' } }, 'Operator "in" is not supported for status');
        rejects({ deadline: { where: '1' } }, 'Operator "where" is not supported for deadline');
    });
});

describe('QueryBuilder', () => {
    test('filters, sorts by several fields and pages', () => {
        const query = recorder();
        const built = new QueryBuilder(query, {
            status: 'LATE',
            sort: '-createdAt, deadline',
            page: '3',
            limit: '20',
        })
            .filter()
            .sort()
            .paginate();
        assert.deepEqual(query.calls, [
            ['find', { status: 'LATE' }],
            ['sort', '-assignedAt deadline'],
            ['skip', 40],
            ['limit', 20],
        ]);
        assert.deepEqual([built.page, built.limit], [3, 20]);
    });

    test('uses defaults without a query string', () => {
        const query = recorder();
        new QueryBuilder(query, undefined).filter().sort().paginate();
        assert.deepEqual(query.calls, [
            ['find', {}],
            ['sort', '-assignedAt'],
            ['skip', 0],
            ['limit', DEFAULT_LIMIT],
        ]);
    });

    test('bounds the page and the limit', () => {
        const bounds = (queryString) => {
            const { page, limit } = new QueryBuilder(recorder(), queryString).paginate();
            return [page, limit];
        };
        assert.deepEqual([DEFAULT_LIMIT, MAX_LIMIT], [50, 200]);
        assert.deepEqual(bounds({ page: '-2', limit: '-5' }), [1, 1]);
        assert.deepEqual(bounds({ page: 'x', limit: 'x' }), [1, 50]);
        assert.deepEqual(bounds({ limit: '200' }), [1, 200]);
        assert.deepEqual(bounds({ limit: '201' }), [1, 200]);
    });
});
