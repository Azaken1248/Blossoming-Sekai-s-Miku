import { describe } from 'node:test';
import request from 'supertest';
import { guildMember } from '../support/discordRest.js';
import { LEFT, MEMBER, VA, useApiWorld } from '../support/apiRecording.js';

const world = useApiWorld('sekai_char_api_cards');
const { scenario } = world;

const ROLES = [
    { id: '700000000000000002', name: '🎤 Voice Actor' },
    { id: '700000000000000003', name: 'Sound Engineer Supreme' },
];

const decorated = () =>
    world.connect({
        roles: ROLES,
        members: [
            guildMember(MEMBER, {
                globalName: '🌸 Hatsune Miku Superfan Deluxe',
                avatar: 'abc',
                roles: ['700000000000000002', '700000000000000003'],
            }),
        ],
        users: { [MEMBER]: { id: MEMBER, avatar: 'abc' } },
    });

describe('GET /api/users/:discordId/card.png', () => {
    scenario('draws the full card for a member in the guild', async () => {
        await world.User.updateOne({ discordId: MEMBER }, { strikes: 1, isOnHiatus: true });
        await world.seedTasks(MEMBER, [{ status: 'COMPLETED', roleName: 'mixer' }, { roleName: 'VA' }]);
        decorated();
        return world.get(`/api/users/${MEMBER}/card.png`);
    });
    scenario('wraps a long description onto two lines', async () => {
        await world.User.updateOne({ discordId: MEMBER }, { username: 'a very long display name indeed' });
        await world.seedTasks(MEMBER, [{ roleName: 'translyricist and lyricist and composer' }]);
        return world.get(`/api/users/${MEMBER}/card.png`);
    });
    scenario('falls back to an initials avatar when Discord has none', async () => {
        await world.User.collection.updateOne({ discordId: LEFT }, { $unset: { joinedAt: '' } });
        world.connect({ roles: ROLES, members: [] });
        return world.get(`/api/users/${LEFT}/card.png`);
    });
    scenario('draws without images when they cannot be fetched', () => {
        world.connect({ roles: ROLES, members: [], throwing: ['/avatars/', '/assets/', '/9.x/'] });
        return world.get(`/api/users/${MEMBER}/card.png`);
    });
    scenario('a missing member gets the default picture', () => world.get('/api/users/999/card.png'));
    scenario('a failed render gets the default picture', () => {
        world.sharpFails = true;
        return world.get(`/api/users/${MEMBER}/card.png`);
    });
});

describe('GET /share/user/:discordId/card.svg', () => {
    scenario('draws the summary with two stickers', async (t) => {
        t.mock.method(Math, 'random', () => 0.25);
        await world.User.updateOne({ discordId: MEMBER }, { strikes: 2 });
        await world.seedTasks(MEMBER, [{ status: 'COMPLETED' }, { roleName: 'editor' }]);
        decorated();
        return world.get(`/share/user/${MEMBER}/card.svg`);
    });
    scenario('uses the stored record when the summary fails', (t) => {
        t.mock.method(Math, 'random', () => 0.75);
        t.mock.method(world.Assignment, 'find', () => {
            throw new Error('summary down');
        });
        return world.User.updateOne({ discordId: MEMBER }, { roles: ['Lead', 'Backup', 'Third'] }).then(() =>
            world.get(`/share/user/${MEMBER}/card.svg`),
        );
    });
    scenario('a stored record with no roles', (t) => {
        t.mock.method(Math, 'random', () => 0.5);
        t.mock.method(world.Assignment, 'find', () => {
            throw new Error('summary down');
        });
        return world.get(`/share/user/${LEFT}/card.svg`);
    });
    scenario('a missing member', () => world.get('/share/user/999/card.svg'));
    scenario('a failure', (t) => {
        t.mock.method(world.User, 'findOne', () => {
            throw new Error('down');
        });
        return world.get(`/share/user/${MEMBER}/card.svg`);
    });
});

describe('GET /share/user/:discordId', () => {
    scenario('the share page of a member', async () => {
        await world.User.updateOne({ discordId: MEMBER }, { roles: [VA], isOnHiatus: true, strikes: 1 });
        await world.seedTasks(MEMBER, [{ status: 'COMPLETED' }]);
        return world.get(`/share/user/${MEMBER}`);
    });
    scenario('the share page from the stored record', (t) => {
        t.mock.method(world.Assignment, 'find', () => {
            throw new Error('summary down');
        });
        return request(world.app).get(`/share/user/${LEFT}`).set('Host', 'api.test');
    });
    scenario('a missing member', () => world.get('/share/user/999'));
    scenario('a failure', (t) => {
        t.mock.method(world.User, 'findOne', () => {
            throw new Error('down');
        });
        return world.get(`/share/user/${MEMBER}`);
    });
});

describe('other pages', () => {
    scenario('the landing page', () => world.get('/'));
    scenario('the OG redirect page fails quietly', (t) => {
        t.mock.method(world.User, 'findOne', () => {
            throw new Error('down');
        });
        return world.get(`/api/users/share/${MEMBER}`);
    });
    scenario('an extension that fails for another reason', (t) => {
        t.mock.method(world.Assignment, 'findById', () => {
            throw new Error('down');
        });
        return request(world.app)
            .post(`/api/assignments/${'a'.repeat(24)}/extend`)
            .set('x-api-key', 'k'.repeat(40))
            .send({ extensionHours: 24 });
    });
    scenario('an extension for an id that is not an ObjectId', () =>
        request(world.app)
            .post('/api/assignments/not-an-id/extend')
            .set('x-api-key', 'k'.repeat(40))
            .send({ extensionHours: 24 }),
    );
});
