import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createAssignmentService } from '../../Services/assignmentService.ts';
import { createMemberService } from '../../Services/memberService.ts';
import { createStrikeService } from '../../Services/strikeService.ts';
import { WEEK } from '../../Utils/domain/durations.ts';
import { at, clock, RULES, fakes, task, member, profile, refuses } from './fakes.js';

describe('layering', () => {
    test('no service imports Discord, Express, Mongoose or a schema', async () => {
        const directory = new URL('../../Services/', import.meta.url);
        for (const file of await readdir(directory)) {
            const source = await readFile(new URL(file, directory), 'utf8');
            assert.doesNotMatch(
                source,
                /from '(discord\.js|express|mongoose)'|DB\/Schemas|Date\.now|Math\.random/,
                file,
            );
        }
    });
});

describe('strikes', () => {
    for (const [action, call] of [
        ['add', 'addStrike'],
        ['remove', 'removeStrike'],
    ]) {
        test(`${action} makes sure the member exists, then reports the count`, async () => {
            const { port, calls } = fakes({ findOrCreate: {}, [call]: 2 });
            const service = createStrikeService({ members: port });
            assert.deepEqual(await service[action]({ discordId: '1', username: 'one' }), { strikes: 2 });
            assert.deepEqual(calls, [
                ['findOrCreate', '1', 'one'],
                [call, '1'],
            ]);
        });

        test(`${action} reports a member that vanished, but not a count of zero`, async () => {
            const service = (count) =>
                createStrikeService({ members: fakes({ findOrCreate: {}, [call]: count }).port });
            await refuses(service(null)[action]({ discordId: '1', username: 'one' }), 'MEMBER_NOT_FOUND');
            assert.deepEqual(await service(0)[action]({ discordId: '1', username: 'one' }), { strikes: 0 });
        });
    }

    test('list passes the members through', async () => {
        const listed = [member()];
        assert.equal(await createStrikeService({ members: fakes({ listWithStrikes: listed }).port }).list(), listed);
    });
});

describe('members', () => {
    const service = (answers) => {
        const { port, calls } = fakes(answers);
        return { calls, ...createMemberService({ members: port, defaultFarewell: 'Farewell' }) };
    };

    test('knows who is onboarded', async () => {
        assert.equal(await service({ isActive: true }).isOnboarded('1'), true);
        assert.equal(await service({ isActive: false }).isOnboarded('1'), false);
    });

    test('onboards a new, an existing and a returning member', async () => {
        assert.deepEqual(await service({ findOrCreate: { member: member(), created: true } }).onboard('1', 'one'), {
            status: 'created',
            strikes: 1,
        });
        assert.deepEqual(await service({ findOrCreate: { member: member(), created: false } }).onboard('1', 'one'), {
            status: 'existing',
            strikes: 1,
        });
        const gone = { member: member({ isDeboarded: true }), created: false };
        const returning = service({ findOrCreate: gone, reactivate: member({ strikes: 2 }) });
        assert.deepEqual(await returning.onboard('1', 'renamed'), { status: 'restored', strikes: 2 });
        assert.deepEqual(returning.calls.at(-1), ['reactivate', '1', 'renamed']);
        assert.deepEqual(await service({ findOrCreate: gone, reactivate: null }).onboard('1', 'one'), {
            status: 'restored',
            strikes: 1,
        });
    });

    test('deboards with the given or default message', async () => {
        const deboard = (_id, message) => member({ isDeboarded: true, deboardedMessage: message });
        const run = (message) => service({ findByDiscordId: member(), deboard }).deboard('1', message);
        assert.deepEqual(await run('Bye'), { statusMessage: 'Bye' });
        assert.deepEqual(await run(null), { statusMessage: 'Farewell' });
        assert.deepEqual(await run(''), { statusMessage: 'Farewell' });
    });

    test('refuses to deboard a missing, deboarded or just deboarded member', async () => {
        await refuses(service({ findByDiscordId: null }).deboard('1', null), 'MEMBER_NOT_FOUND');
        const already = service({ findByDiscordId: member({ isDeboarded: true }), deboard: member() });
        await refuses(already.deboard('1', null), 'MEMBER_ALREADY_DEBOARDED');
        assert.deepEqual(already.calls, [['findByDiscordId', '1']]);
        await refuses(
            service({ findByDiscordId: member(), deboard: null }).deboard('1', null),
            'MEMBER_ALREADY_DEBOARDED',
        );
    });

    test('summarises a profile by status', async () => {
        const tasks = ['PENDING', 'COMPLETED', 'LATE', 'EXCUSED'].map((status) => task(status, { status }));
        const summary = await service({ findProfile: profile(...tasks) }).profile('1');
        assert.deepEqual(
            [summary.total, summary.pending, summary.completed, summary.late],
            [4, [tasks[0]], [tasks[1]], [tasks[2]]],
        );
        assert.deepEqual(summary.member, member());
        await refuses(service({ findProfile: null }).profile('1'), 'MEMBER_NOT_FOUND');
    });

    test('lists active tasks, or says why there are none', async () => {
        const late = task('b', { status: 'LATE' });
        const found = await service({ findProfile: profile(task('a'), late, task('c', { status: 'COMPLETED' })) });
        assert.deepEqual(await found.activeTasks('1'), { member: member(), tasks: [task('a'), late] });
        await refuses(service({ findProfile: null }).activeTasks('1'), 'MEMBER_NOT_FOUND');
        const gone = { ...profile(task('a')), isDeboarded: true };
        await refuses(service({ findProfile: gone }).activeTasks('1'), 'MEMBER_DEBOARDED');
        await refuses(service({ findProfile: profile() }).activeTasks('1'), 'NO_TASKS');
        const done = profile(task('a', { status: 'COMPLETED' }));
        await refuses(service({ findProfile: done }).activeTasks('1'), 'NO_ACTIVE_TASKS');
    });

    test('reports availability and splits free members by hiatus', async () => {
        const answer = { isFree: true };
        assert.equal(await service({ findAvailability: answer }).availability('1'), answer);
        await refuses(service({ findAvailability: null }).availability('1'), 'MEMBER_NOT_FOUND');
        const [a, b] = [{ isOnHiatus: false }, { isOnHiatus: true }];
        assert.deepEqual(await service({ listFree: [a, b] }).freeMembers(), { active: [a], onHiatus: [b] });
    });
});

describe('assignments', () => {
    const service = (taskAnswers, memberAnswers = {}) => {
        const tasks = fakes(taskAnswers);
        const members = fakes(memberAnswers);
        return {
            tasks: tasks.calls,
            members: members.calls,
            ...createAssignmentService({ tasks: tasks.port, members: members.port, rules: RULES, clock }),
        };
    };
    const request = { target: { discordId: '1', username: 'one' }, taskType: 'skit', roleName: 'VA', roleIds: ['va'] };

    test('assigns a planned task to the member, creating the record if needed', async () => {
        const created = task('new');
        const run = service({ create: created }, { findOrCreate: { member: member(), created: true } });
        assert.equal(await run.assign({ ...request, taskName: 'N', description: 'D' }), created);
        assert.deepEqual(run.members, [['findOrCreate', '1', 'one']]);
        assert.deepEqual(run.tasks, [
            [
                'create',
                {
                    memberId: 'm1',
                    discordUserId: '1',
                    taskType: 'skit',
                    taskName: 'N',
                    description: 'D',
                    roleCategoryId: 'va',
                    roleName: 'VA',
                    deadline: at(2 * WEEK),
                    customExtension: null,
                },
            ],
        ]);
        await run.assign(request);
        assert.deepEqual([run.tasks[1][1].taskName, run.tasks[1][1].description], ['', '']);
    });

    test('touches nothing when the plan is refused', async () => {
        const run = service({ create: task('x') }, { findOrCreate: { member: member() } });
        await refuses(run.assign({ ...request, roleIds: [] }), 'ROLE_MISSING', { roleName: 'VA' });
        assert.deepEqual([run.tasks, run.members], [[], []]);
    });

    test('removes a task and reports its title', async () => {
        const run = service({ findByIdentifier: task('a', { taskName: 'Intro' }), remove: 'removed' });
        assert.deepEqual(await run.remove('1', 'Intro'), { title: 'Intro' });
        assert.deepEqual(run.tasks, [
            ['findByIdentifier', '1', 'Intro'],
            ['remove', 'a'],
        ]);
    });

    test('refuses to remove a missing or completed task, before or during the attempt', async () => {
        const details = { title: 'skit' };
        await refuses(service({ findByIdentifier: null }).remove('1', 'x'), 'TASK_NOT_FOUND');
        const done = service({ findByIdentifier: task('a', { status: 'COMPLETED' }), remove: 'removed' });
        await refuses(done.remove('1', 'x'), 'TASK_IS_PERMANENT', details);
        assert.equal(done.tasks.length, 1);
        const during = (outcome) => service({ findByIdentifier: task('a'), remove: outcome }).remove('1', 'x');
        await refuses(during('completed'), 'TASK_IS_PERMANENT', details);
        await refuses(during('missing'), 'TASK_NOT_FOUND');
    });

    test('pages history five at a time and keeps the page in range', async () => {
        const found = Array.from({ length: 11 }, (_, index) => task(index));
        const run = service({ listHistory: found });
        const ids = async (page) => {
            const result = await run.historyPage({ status: 'late' }, page);
            return [result.page, result.totalPages, result.total, result.tasks.map(({ id }) => id)];
        };
        assert.deepEqual(await ids(0), [0, 3, 11, [0, 1, 2, 3, 4]]);
        assert.deepEqual(await ids(2), [2, 3, 11, [10]]);
        assert.deepEqual(await ids(9), [2, 3, 11, [10]]);
        assert.deepEqual(await ids(-1), [0, 3, 11, [0, 1, 2, 3, 4]]);
        assert.deepEqual(run.tasks[0], ['listHistory', { status: 'late' }]);
        assert.deepEqual(await service({ listHistory: [] }).historyPage({}, 0), {
            tasks: [],
            page: 0,
            totalPages: 0,
            total: 0,
        });
    });
});
