import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CARD_SERVICE_URL, createCardService, readCardServiceUrl } from '../../Services/cardService.ts';
import { createExtensionService } from '../../Services/extensionService.ts';
import { createHiatusService } from '../../Services/hiatusService.ts';
import { createSubmissionService } from '../../Services/submissionService.ts';
import { DAY, WEEK } from '../../Utils/domain/durations.ts';
import { at, clock, RULES, fakes, task, member, profile, refuses } from './fakes.js';

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
