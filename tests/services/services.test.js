import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createAssignmentService } from '../../Services/assignmentService.ts';
import { DEFAULT_CARD_SERVICE_URL, createCardService, readCardServiceUrl } from '../../Services/cardService.ts';
import { createExtensionService } from '../../Services/extensionService.ts';
import { createHiatusService } from '../../Services/hiatusService.ts';
import { createMemberService } from '../../Services/memberService.ts';
import { createStrikeService } from '../../Services/strikeService.ts';
import { createSubmissionService } from '../../Services/submissionService.ts';
import { DAY, WEEK } from '../../Utils/domain/durations.ts';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const at = (offset) => new Date(NOW.getTime() + offset);
const clock = { now: () => NOW };
const RULES = {
    va: { name: 'VA', tasks: { skit: 2 * WEEK }, extension: WEEK },
    bare: { name: 'Bare', tasks: {} },
};

const fakes = (answers = {}) => {
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

const task = (id, extra = {}) => ({
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
const member = (extra = {}) => ({
    id: 'm1',
    discordId: '1',
    username: 'one',
    strikes: 1,
    isOnHiatus: false,
    isDeboarded: false,
    deboardedMessage: 'Bye',
    ...extra,
});
const profile = (...assignments) => member({ assignments });

const refuses = (promise, code, details) =>
    assert.rejects(promise, (error) => {
        assert.deepEqual([error.name, error.code, error.details], ['DomainError', code, details]);
        return true;
    });

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

describe('submissions', () => {
    const service = (found) => {
        const tasks = fakes({ setSubmissionChannel: undefined });
        const members = fakes({ findProfile: found });
        return { calls: tasks.calls, ...createSubmissionService({ tasks: tasks.port, members: members.port }) };
    };
    const named = task('a', { taskName: 'Intro', taskType: 'story' });
    const late = task('b', { status: 'LATE' });
    const done = task('c', { status: 'COMPLETED', taskName: 'Done' });

    test('sends the only open task and remembers the channel', async () => {
        const run = service(profile(late, done));
        assert.deepEqual(await run.request({ discordId: '1', channelId: '7' }), { kind: 'request', task: late });
        assert.deepEqual(run.calls, [['setSubmissionChannel', 'b', '7']]);
    });

    test('leaves the channel alone when there is none', async () => {
        const run = service(profile(late));
        await run.request({ discordId: '1', channelId: null });
        assert.deepEqual(run.calls, []);
    });

    test('offers a choice of open tasks without changing anything', async () => {
        const run = service(profile(named, late, done));
        assert.deepEqual(await run.request({ discordId: '1', channelId: '7' }), {
            kind: 'choose',
            tasks: [named, late],
        });
        assert.deepEqual(run.calls, []);
    });

    test('finds a task by id, or by name or type in any case', async () => {
        const pick = async (request) =>
            (await service(profile(named, late, done)).request({ discordId: '1', ...request })).task.id;
        assert.equal(await pick({ taskId: 'b', taskName: 'Intro' }), 'b');
        assert.equal(await pick({ taskName: 'INTRO' }), 'a');
        assert.equal(await pick({ taskName: 'SKIT' }), 'b');
        assert.equal(await pick({ taskName: 'Story' }), 'a');
    });

    test('refuses when nothing is open or nothing matches', async () => {
        for (const found of [null, profile(), profile(done)]) {
            await refuses(service(found).request({ discordId: '1' }), 'NO_PENDING_TASKS');
        }
        await refuses(service(profile(late)).request({ discordId: '1', taskId: 'c' }), 'TASK_GONE');
        await refuses(service(profile(late, done)).request({ discordId: '1', taskName: 'Done' }), 'TASK_NAME_UNKNOWN', {
            taskName: 'Done',
        });
    });
});

describe('extensions', () => {
    const service = (found) => {
        const tasks = fakes({ setSubmissionChannel: undefined });
        const members = fakes({ findProfile: found });
        return {
            calls: tasks.calls,
            ...createExtensionService({ tasks: tasks.port, members: members.port, rules: RULES }),
        };
    };
    const ask = (found, extra = {}) => service(found).request({ discordId: '1', reason: 'busy', ...extra });

    test('answers with the task and its length, and remembers the channel', async () => {
        const run = service(profile(task('a')));
        const outcome = await run.request({ discordId: '1', reason: 'busy', channelId: '7' });
        assert.deepEqual(outcome, { task: task('a'), extensionMs: WEEK });
        assert.deepEqual(run.calls, [['setSubmissionChannel', 'a', '7']]);
        const quiet = service(profile(task('a', { customExtension: DAY })));
        assert.equal((await quiet.request({ discordId: '1', reason: 'busy' })).extensionMs, DAY);
        assert.deepEqual(quiet.calls, []);
    });

    test('matches a name in any case, but a type exactly', async () => {
        const found = profile(task('a', { taskName: 'Intro', taskType: 'story' }), task('b'));
        assert.equal((await ask(found, { taskName: 'INTRO' })).task.id, 'a');
        assert.equal((await ask(found, { taskName: 'skit' })).task.id, 'b');
        await refuses(ask(found, { taskName: 'SKIT' }), 'TASK_NAME_UNKNOWN', { taskName: 'SKIT' });
    });

    test('refuses when nothing is pending, before looking at the reason', async () => {
        for (const found of [null, profile(), profile(task('a', { status: 'LATE' }))]) {
            await refuses(ask(found, { reason: '' }), 'NO_PENDING_TASKS');
        }
    });

    test('refuses a blank reason, before choosing a task', async () => {
        await refuses(ask(profile(task('a'), task('b')), { reason: '  ' }), 'REASON_REQUIRED');
    });

    test('refuses an ambiguous or fully extended task', async () => {
        const pair = [task('a'), task('b')];
        await refuses(ask(profile(...pair)), 'TASK_AMBIGUOUS', { tasks: pair });
        await refuses(ask(profile(task('a', { extensionCount: 2 }))), 'ALREADY_EXTENDED');
    });

    test('answers without a length when the role has no window for a skit, as it always has', async () => {
        const outcome = await ask(profile(task('a', { roleCategoryId: 'bare' })));
        assert.equal(outcome.extensionMs, undefined);
    });

    test('reports an unknown role and stores nothing', async () => {
        const run = service(profile(task('a', { roleCategoryId: 'gone' })));
        await assert.rejects(run.request({ discordId: '1', reason: 'busy', channelId: '7' }), {
            name: 'ConfigError',
            code: 'CONFIG_MISSING_ROLE',
        });
        assert.deepEqual(run.calls, []);
    });
});

describe('hiatus', () => {
    const service = (answers) => {
        const { port, calls } = fakes(answers);
        return { calls, ...createHiatusService({ members: port, rules: RULES, clock }) };
    };

    test('starts and reports how many tasks were paused', async () => {
        const run = service({ startHiatus: 3 });
        assert.deepEqual(await run.start('1'), { pausedCount: 3 });
        assert.deepEqual(run.calls, [['startHiatus', '1']]);
    });

    test('ends with fresh deadlines from the rules, reporting titles', async () => {
        const paused = [task('a', { taskName: 'Intro' }), task('b', { taskType: 'custom' })];
        const deadlines = [];
        const endHiatus = (_id, fresh) => {
            deadlines.push(...paused.map(fresh));
            return { restored: [paused[0]], skipped: [paused[1]] };
        };
        const run = service({ findByDiscordId: member({ isOnHiatus: true }), endHiatus });
        assert.deepEqual(await run.end('1'), { restored: ['Intro'], skipped: ['custom'] });
        assert.deepEqual(deadlines, [at(2 * WEEK), null]);
    });

    test('refuses a missing member, one not on hiatus, or one whose hiatus just ended', async () => {
        await refuses(service({ findByDiscordId: null }).end('1'), 'MEMBER_NOT_FOUND');
        const active = service({ findByDiscordId: member(), endHiatus: { restored: [], skipped: [] } });
        await refuses(active.end('1'), 'NOT_ON_HIATUS');
        assert.equal(active.calls.length, 1);
        await refuses(
            service({ findByDiscordId: member({ isOnHiatus: true }), endHiatus: null }).end('1'),
            'NOT_ON_HIATUS',
        );
    });
});

describe('cards', () => {
    const service = (found, response) => {
        const urls = [];
        const fetch = async (url) => {
            urls.push(url);
            return response;
        };
        const { port } = fakes({ findByDiscordId: found });
        return { urls, ...createCardService({ members: port, fetch, baseUrl: 'https://cards.test' }) };
    };

    test('fetches the image for an active or unknown member', async () => {
        for (const found of [member(), null]) {
            const run = service(found, new Response('PNG'));
            assert.deepEqual(await run.get('1'), { kind: 'card', image: Buffer.from('PNG') });
            assert.deepEqual(run.urls, ['https://cards.test/api/card/1']);
        }
    });

    test('answers for a deboarded member without fetching', async () => {
        const gone = member({ isDeboarded: true });
        const run = service(gone, new Response('PNG'));
        assert.deepEqual([await run.get('1'), run.urls], [{ kind: 'deboarded', member: gone }, []]);
    });

    test('reports a card that does not exist', async () => {
        await refuses(service(null, new Response('', { status: 404 })).get('1'), 'CARD_NOT_FOUND');
    });

    test('reads its address from the environment, defaulting to the live one', () => {
        assert.equal(DEFAULT_CARD_SERVICE_URL, 'https://sekaicard.azaken.com');
        assert.deepEqual([undefined, '', '  '].map(readCardServiceUrl), Array(3).fill(DEFAULT_CARD_SERVICE_URL));
        assert.equal(readCardServiceUrl(' http://localhost:3051/ '), 'http://localhost:3051');
        assert.equal(readCardServiceUrl('https://cards.test/base'), 'https://cards.test/base');
        for (const value of ['cards.test', 'ftp://cards.test', 'file:///etc/passwd']) {
            assert.throws(() => readCardServiceUrl(value), {
                name: 'RangeError',
                message: `CARD_SERVICE_URL must be an http or https address, got "${value}"`,
            });
        }
    });
});
