import { describe, mock } from 'node:test';
import { guildMember } from '../support/discordRest.js';
import { LEFT, MEMBER, MINUTE, OTHER, VA, useApiWorld } from '../support/apiRecording.js';

const world = useApiWorld('sekai_char_api_discord');
const { scenario } = world;

const ROLES = [
    { id: '700000000000000001', name: '@everyone' },
    { id: '700000000000000002', name: 'Voice Actor' },
    { id: '700000000000000003', name: 'Editor' },
];

const inGuild = () => [
    guildMember(MEMBER, { globalName: 'VA One', avatar: 'abc', roles: ['700000000000000001', '700000000000000002'] }),
    guildMember(OTHER, { name: 'editor_handle', roles: ['700000000000000009'] }),
];

const fillers = (count) =>
    Array.from({ length: count }, (_, index) => guildMember(`09${String(index).padStart(16, '0')}`));

const roster = (body) => ({ count: body.count, names: body.data.map((user) => user.username) });

describe('GET /api/users with Discord', () => {
    scenario('enriches members in the guild and leaves out the rest', async () => {
        await world.User.updateOne({ discordId: OTHER }, { roles: [VA] });
        world.connect({ roles: ROLES, members: inGuild() });
        return world.get('/api/users');
    });
    scenario(
        'pages through the guild a thousand members at a time',
        () => {
            world.connect({ roles: ROLES, members: [...fillers(1000), ...inGuild()] });
            return world.get('/api/users');
        },
        { body: roster },
    );
    scenario(
        'asks for one more page after exactly a thousand members',
        () => {
            world.connect({ roles: ROLES, members: [...fillers(999), inGuild()[0]] });
            return world.get('/api/users');
        },
        { body: roster },
    );
    scenario('a failing role lookup reuses the last role map, even from another guild', async () => {
        await world.User.updateOne({ discordId: MEMBER }, { roles: [VA, 'Custom'] });
        world.connect({ roles: ROLES, members: inGuild(), failing: ['/roles'] });
        return world.get('/api/users');
    });
    scenario('lists nobody when the member list fails', () => {
        world.connect({ roles: ROLES, members: inGuild(), failing: ['/members'] });
        return world.get('/api/users');
    });
    scenario('lists from the database alone without a guild', () => {
        world.connect({ roles: ROLES, members: inGuild() }, { guild: false });
        return world.get('/api/users');
    });
    scenario('keeps the member list for two minutes and the roles for ten', async () => {
        world.connect({ roles: ROLES, members: inGuild() });
        for (const minutes of [0, 1, 2, 9]) {
            mock.timers.tick(minutes * MINUTE);
            await world.get('/api/users');
        }
        mock.timers.tick(MINUTE);
        return world.get('/api/users');
    });
    scenario('keeps the old roles when a refresh fails', async () => {
        const rest = world.connect({ roles: ROLES, members: inGuild() });
        await world.get('/api/users');
        mock.timers.tick(11 * MINUTE);
        rest.world.failing.push('/roles');
        return world.get('/api/users');
    });
});

describe('GET /api/users/:discordId/summary with Discord', () => {
    scenario('a member in the guild with an animated avatar', async () => {
        await world.seedTasks(MEMBER, [{ status: 'COMPLETED' }, { roleName: 'SVA' }]);
        world.connect({
            roles: ROLES,
            members: [guildMember(MEMBER, { avatar: 'a_anim', roles: ['700000000000000003'] })],
            users: { [MEMBER]: { id: MEMBER, avatar: 'a_anim' } },
        });
        return world.get(`/api/users/${MEMBER}/summary`);
    });
    scenario('a member who left the guild keeps their Discord avatar and stored roles', async () => {
        await world.User.updateOne({ discordId: LEFT }, { roles: [VA] });
        world.connect({ roles: ROLES, members: inGuild(), users: { [LEFT]: { id: LEFT, avatar: 'def' } } });
        return world.get(`/api/users/${LEFT}/summary`);
    });
    scenario('a member with no roles anywhere shows their task roles', async () => {
        await world.seedTasks(LEFT, [{ roleName: 'editor' }, { roleName: 'editor' }, { roleName: 'VA' }]);
        world.connect({ roles: ROLES, members: inGuild() });
        return world.get(`/api/users/${LEFT}/summary`);
    });
    scenario('a member with no roles and no tasks', () => {
        world.connect({ roles: ROLES, members: [guildMember(LEFT)] });
        return world.get(`/api/users/${LEFT}/summary`);
    });
    scenario('a token without a guild looks up only the user', () => {
        world.connect({ users: { [MEMBER]: { id: MEMBER, avatar: 'abc' } } }, { guild: false });
        return world.get(`/api/users/${MEMBER}/summary`);
    });
    scenario('a failing user lookup leaves the avatar empty', () => {
        world.connect({ roles: ROLES, members: [], throwing: [`/users/${MEMBER}`] });
        return world.get(`/api/users/${MEMBER}/summary`);
    });
    scenario('a failing member list fails the summary', () => {
        world.connect({ roles: ROLES, throwing: ['/members?'] });
        return world.get(`/api/users/${MEMBER}/summary`);
    });
});

describe('Miku descriptions', () => {
    const describeMember = (name, changes, tasks = []) =>
        scenario(
            name,
            async () => {
                await world.User.updateOne({ discordId: MEMBER }, changes);
                await world.seedTasks(MEMBER, tasks);
                return world.get(`/api/users/${MEMBER}/summary`);
            },
            { body: (body) => body.data.mikuDescription },
        );

    describeMember('on hiatus', { isOnHiatus: true, strikes: 2 });
    describeMember('two strikes', { strikes: 2 });
    describeMember(
        'fifteen tasks done',
        {},
        Array.from({ length: 15 }, () => ({ status: 'COMPLETED' })),
    );
    describeMember('a role starting with a vowel', {}, [{ roleName: 'editor' }]);
    describeMember('two task roles', {}, [{ roleName: 'mixer' }, { roleName: 'VA' }]);
    describeMember('nothing yet', {});
});
