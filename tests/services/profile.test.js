import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createProfileService } from '../../Services/profileService.ts';
import { createRecordService } from '../../Services/recordService.ts';
import { createStrikeService } from '../../Services/strikeService.ts';

const ROLE_NAMES = new Map([
    ['111', 'VA'],
    ['222', '@everyone'],
]);

const setUp = ({ users = [], member = null, tasks = [], everyone = null, person = null, avatar = null } = {}) => {
    const calls = [];
    const note =
        (name, value) =>
        async (...args) => {
            calls.push([name, ...args]);
            return value;
        };
    const service = createProfileService({
        records: {
            listUsers: note('listUsers', users),
            summaryRecord: note('summaryRecord', member),
            storedMember: note('storedMember', member),
            profile: note('profile', member),
            taskRoles: note('taskRoles', tasks),
        },
        guild: {
            avatar: note('avatar', { avatarUrl: avatar }),
            everyone: note('everyone', everyone),
            find: note('find', person),
        },
        roleName: (stored) => ROLE_NAMES.get(stored),
        describe: (facts) => JSON.stringify(facts),
    });
    return { calls, service };
};

describe('roster', () => {
    const users = [
        { discordId: '1', username: 'one', roles: ['111', '222', 'Custom', ''] },
        { discordId: '2', username: 'two' },
        { discordId: '3', username: '', roles: 'not a list' },
    ];

    test('without a guild, every member with their stored roles named', async () => {
        const { calls, service } = setUp({ users });
        assert.deepEqual(await service.roster({ limit: 5, search: 'o' }), [
            { ...users[0], storedRoles: ['VA', 'Custom'], actualRoles: ['VA', 'Custom'] },
            { ...users[1], storedRoles: [], actualRoles: [] },
            { ...users[2], storedRoles: [], actualRoles: [] },
        ]);
        assert.deepEqual(calls, [['listUsers', { limit: 5, search: 'o' }], ['everyone']]);
    });

    test('with a guild, only members in it, named and pictured from Discord', async () => {
        const everyone = new Map([
            ['1', { displayName: 'One!', avatarUrl: 'a1', roleNames: [] }],
            ['3', { displayName: null, avatarUrl: null, roleNames: ['Editor'] }],
        ]);
        const { service } = setUp({ users, everyone });
        assert.deepEqual(await service.roster({}), [
            {
                ...users[0],
                username: 'One!',
                avatarUrl: 'a1',
                storedRoles: ['VA', 'Custom'],
                actualRoles: ['VA', 'Custom'],
            },
            { ...users[2], username: 'Unknown User', avatarUrl: null, storedRoles: [], actualRoles: ['Editor'] },
        ]);
    });
});

describe('summary', () => {
    test('nobody without a record', async () => {
        const { calls, service } = setUp();
        assert.equal(await service.summary('1'), null);
        assert.deepEqual(calls, [['summaryRecord', '1']]);
    });

    test('a member in the guild', async () => {
        const member = { discordId: '1', username: 'one', strikes: 1, isOnHiatus: true, roles: ['111'] };
        const tasks = [{ status: 'COMPLETED', roleName: 'mixer' }, { roleName: 'VA' }, { roleName: 'mixer' }];
        const person = { displayName: 'One!', avatarUrl: 'guild', roleNames: ['Editor'] };
        const { calls, service } = setUp({ member, tasks, person, avatar: 'discord' });
        assert.deepEqual(await service.summary('1'), {
            ...member,
            username: 'One!',
            avatarUrl: 'guild',
            storedRoles: ['VA'],
            actualRoles: ['Editor'],
            totalAssignments: 3,
            tasksCompleted: 1,
            topTaskRoles: ['mixer', 'VA'],
            mikuDescription: JSON.stringify({
                username: 'One!',
                strikes: 1,
                isOnHiatus: true,
                tasksCompleted: 1,
                topTaskRoles: ['mixer', 'VA'],
            }),
            isGuildMember: true,
        });
        assert.deepEqual(calls, [
            ['summaryRecord', '1'],
            ['taskRoles', '1'],
            ['avatar', '1'],
            ['find', '1'],
        ]);
    });

    test('a member with no tasks shows their roles as work roles', async () => {
        const member = { discordId: '1', roles: ['111', 'B', 'C', 'D'] };
        const { service } = setUp({ member, avatar: 'discord' });
        const summary = await service.summary('1');
        assert.deepEqual(summary.topTaskRoles, ['VA', 'B', 'C']);
        assert.equal(summary.avatarUrl, 'discord');
        assert.equal(summary.username, 'Unknown User');
        assert.equal(summary.isGuildMember, false);
        assert.deepEqual(JSON.parse(summary.mikuDescription), {
            username: 'Unknown User',
            strikes: 0,
            isOnHiatus: false,
            tasksCompleted: 0,
            topTaskRoles: ['VA', 'B', 'C'],
        });
    });
});

describe('card', () => {
    test('nobody without a record', async () => {
        const { service } = setUp();
        assert.equal(await service.card('1'), null);
    });

    test('two server roles and two work roles', async () => {
        const member = { discordId: '1', username: 'one', roles: ['A', 'B', 'C'] };
        const tasks = [{ roleName: 'x' }, { roleName: 'y' }, { roleName: 'z' }, { status: 'COMPLETED', roleName: 'x' }];
        const { service } = setUp({ member, tasks, avatar: 'discord' });
        assert.deepEqual(await service.card('1'), {
            member,
            username: 'one',
            avatarUrl: 'discord',
            serverRoles: ['A', 'B'],
            workRoles: ['x', 'y'],
            tasksCompleted: 1,
            description: JSON.stringify({
                username: 'one',
                strikes: 0,
                isOnHiatus: false,
                tasksCompleted: 1,
                topTaskRoles: ['x', 'y'],
            }),
        });
    });
});

test('stored records pass through unchanged', async () => {
    const member = { discordId: '1', any: 'thing' };
    const { calls, service } = setUp({ member });
    assert.equal(await service.record('1'), member);
    assert.equal(await service.storedMember('2'), member);
    assert.deepEqual(calls, [
        ['profile', '1'],
        ['storedMember', '2'],
    ]);
});

const RULES = { 10: { name: 'VA', tasks: { skit: 1000 }, extension: 0 } };
const NOW = new Date('2026-06-15T12:00:00.000Z');

const recordWorld = (owner) => {
    const calls = [];
    const records = Object.fromEntries(
        [
            'findOrCreateUser',
            'taskOwner',
            'createAssignment',
            'completeAssignment',
            'extendAssignment',
            'fetchPendingTask',
            'fetchOverdueTasks',
        ].map((name) => [
            name,
            async (...args) => {
                calls.push([name, ...args]);
                if (name === 'taskOwner') return owner;
                return name === 'fetchOverdueTasks' ? [] : name;
            },
        ]),
    );
    return { calls, service: createRecordService({ records, rules: RULES, clock: { now: () => NOW } }) };
};

const request = (changes = {}) => ({
    discordId: '1',
    roleCategoryId: '10',
    roleName: undefined,
    taskType: 'skit',
    taskName: 'n',
    description: 'd',
    duration: null,
    ...changes,
});

test('the record service hands every call to the records', async () => {
    const { calls, service } = recordWorld(null);
    assert.deepEqual(
        await Promise.all([
            service.register('1', 'one'),
            service.complete('t'),
            service.extend('t', 5),
            service.pending('1'),
            service.overdue(),
        ]),
        ['findOrCreateUser', 'completeAssignment', 'extendAssignment', 'fetchPendingTask', []],
    );
    assert.deepEqual(calls, [
        ['findOrCreateUser', '1', 'one'],
        ['completeAssignment', 't'],
        ['extendAssignment', 't', 5],
        ['fetchPendingTask', '1'],
        ['fetchOverdueTasks'],
    ]);
});

describe('assigning through the API', () => {
    const owner = { memberId: 'm', discordId: '1', isDeboarded: false };

    test('takes the deadline and role name from the rules', async () => {
        const { calls, service } = recordWorld(owner);
        assert.equal(await service.assign(request()), 'createAssignment');
        assert.deepEqual(calls, [
            ['taskOwner', '1'],
            [
                'createAssignment',
                {
                    memberId: 'm',
                    discordUserId: '1',
                    roleCategoryId: '10',
                    roleName: 'VA',
                    taskType: 'skit',
                    taskName: 'n',
                    description: 'd',
                    deadline: new Date(NOW.getTime() + 1000),
                },
            ],
        ]);
    });

    test('a given duration and role name win', async () => {
        const { calls, service } = recordWorld(owner);
        await service.assign(request({ duration: 5, roleName: 'Lead' }));
        assert.equal(calls[1][1].roleName, 'Lead');
        assert.deepEqual(calls[1][1].deadline, new Date(NOW.getTime() + 5));
    });

    test('refuses before looking the member up', async () => {
        const { calls, service } = recordWorld(owner);
        await assert.rejects(service.assign(request({ taskType: 'nope' })), { code: 'TASK_TYPE_INVALID' });
        assert.deepEqual(calls, []);
    });

    test('refuses a member who is missing or deboarded', async () => {
        await assert.rejects(recordWorld(null).service.assign(request()), { code: 'MEMBER_NOT_FOUND' });
        const deboarded = recordWorld({ ...owner, isDeboarded: true });
        await assert.rejects(deboarded.service.assign(request()), { code: 'MEMBER_DEBOARDED' });
        assert.deepEqual(deboarded.calls, [['taskOwner', '1']]);
    });
});

test('strikes on an existing member go straight to the records', async () => {
    const service = createStrikeService({
        members: { addStrike: async (id) => (id === '1' ? 2 : null), removeStrike: async () => 0 },
    });
    assert.equal(await service.addExisting('1'), 2);
    assert.equal(await service.addExisting('9'), null);
    assert.equal(await service.removeExisting('1'), 0);
});
