import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { startDatabase } from '../support/database.js';

let database;
let User;
let listUsers;

before(async () => {
    database = await startDatabase('sekai_api_records');
    User = (await import('../../DB/Schemas/user.ts')).default;
    ({ listUsers } = await import('../../Utils/DBUtils/apiRecords.ts'));
});

beforeEach(() => database.reset());
after(() => database.stop());

const member = (discordId, username, joinedAt) => User.create({ discordId, username, joinedAt: new Date(joinedAt) });

test('listUsers searches username and id literally, newest first, with a bounded limit', async () => {
    await member('31', 'alpha.one', '2026-01-01');
    await member('32', 'alphaxone', '2026-02-01');
    await member('4331', 'beta', '2026-03-01');
    const names = async (options) => (await listUsers(options)).map(({ username }) => username);
    assert.deepEqual(await names(), ['beta', 'alphaxone', 'alpha.one']);
    assert.deepEqual(await names({ search: '  alpha.  ' }), ['alpha.one']);
    assert.deepEqual(await names({ search: '31' }), ['beta', 'alpha.one']);
    assert.deepEqual(await names({ search: null }), ['beta', 'alphaxone', 'alpha.one']);
    assert.deepEqual(await names({ limit: 1 }), ['beta']);
    assert.equal((await listUsers({ limit: -5 })).length, 1);
    assert.deepEqual(Object.keys((await listUsers({ limit: 1 }))[0]).sort(), [
        '_id',
        'discordId',
        'isOnHiatus',
        'joinedAt',
        'roles',
        'strikes',
        'username',
    ]);
});

test('listUsers returns 100 members by default and never more than 500', async () => {
    await User.insertMany(
        Array.from({ length: 501 }, (_, index) => ({
            discordId: `5${String(index).padStart(17, '0')}`,
            username: `bulk.${index}`,
        })),
    );
    assert.equal((await listUsers()).length, 100);
    assert.equal((await listUsers({ limit: 0 })).length, 100);
    assert.equal((await listUsers({ limit: 'abc' })).length, 100);
    assert.equal((await listUsers({ limit: 500 })).length, 500);
    assert.equal((await listUsers({ limit: 501 })).length, 500);
});
