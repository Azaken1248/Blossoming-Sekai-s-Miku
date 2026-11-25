import { test } from 'node:test';
import assert from 'node:assert/strict';
import config from '../config.js';
import { COMMAND_POLICY, UNKNOWN_COMMAND_MESSAGE, createPermissions } from '../Utils/permissions.ts';
import {
    actorOf,
    isManagerOrOwner as memberManages,
    isOwner as memberOwns,
    roleIdsOf,
} from '../Utils/DiscordUtils/access.js';

const { checkCommandPermission, hasPermission, isAdmin, isManager, isManagerOrOwner, isOwner } =
    createPermissions(config);

const member = (id, roleIds = []) => ({ id, roleIds });
const owner = member('1', [config.OWNER_ROLE_ID]);
const manager = member('2', [config.MANAGER_ROLE_IDS[0]]);
const plain = member('3');

test('recognises owners and managers, and no one when the member is missing', () => {
    assert.deepEqual([owner, manager, plain, null].map(isOwner), [true, false, false, false]);
    assert.deepEqual([owner, manager, plain, null].map(isManager), [false, true, false, false]);
    assert.deepEqual([owner, manager, plain, null].map(isManagerOrOwner), [true, true, false, false]);
});

test('treats a configured admin as both owner and manager', (t) => {
    config.ADMIN_USER_IDS.push('42');
    t.after(() => config.ADMIN_USER_IDS.pop());
    const admin = member('42');
    assert.deepEqual([isAdmin('42'), isOwner(admin), isManager(admin)], [true, true, true]);
    assert.equal(isAdmin('43'), false);
});

test('evaluates every permission level and denies unknown ones', () => {
    assert.equal(hasPermission(null, 'anyone'), true);
    assert.equal(hasPermission(plain, 'selfOrOwner', { actorId: '3', targetId: '3' }), true);
    assert.equal(hasPermission(plain, 'selfOrOwner', { actorId: '3', targetId: '9' }), false);
    assert.equal(hasPermission(plain, 'selfOrOwner', { actorId: '3' }), false);
    assert.equal(hasPermission(plain, 'selfOrOwner'), false);
    assert.equal(hasPermission(owner, 'selfOrOwner', { actorId: '1', targetId: '9' }), true);
    assert.equal(hasPermission(owner, 'selfOrOwner'), true);
    assert.deepEqual(
        [owner, manager, plain].map((who) => hasPermission(who, 'managerOrOwner')),
        [true, true, false],
    );
    assert.deepEqual(
        [owner, manager, plain].map((who) => hasPermission(who, 'owner')),
        [true, false, false],
    );
    assert.equal(hasPermission(owner, 'ownr'), false);
});

test('checks commands against the policy table, denying unknown commands', () => {
    assert.deepEqual(checkCommandPermission('dance', owner), { allowed: false, reason: UNKNOWN_COMMAND_MESSAGE });
    assert.deepEqual(checkCommandPermission('assign', manager), {
        allowed: false,
        reason: COMMAND_POLICY.assign.denial,
    });
    assert.deepEqual(checkCommandPermission('assign', owner), { allowed: true, policy: COMMAND_POLICY.assign });
    assert.deepEqual(checkCommandPermission('submit', plain, { actorId: '3', targetId: '3' }), {
        allowed: true,
        policy: COMMAND_POLICY.submit,
    });
});

test('falls back to a generic denial for a policy without its own wording', (t) => {
    COMMAND_POLICY.probe = { permission: 'owner' };
    t.after(() => delete COMMAND_POLICY.probe);
    assert.deepEqual(checkCommandPermission('probe', plain), {
        allowed: false,
        reason: "You don't have permission to do that.",
    });
});

test('never treats an inherited property name as a command', () => {
    assert.equal(checkCommandPermission('constructor', owner).reason, UNKNOWN_COMMAND_MESSAGE);
});

test('reads the acting member from Discord', () => {
    const discord = (id, roles) => ({ id, roles: { cache: new Map(roles.map((role) => [role, { id: role }])) } });
    const boss = discord('1', [config.OWNER_ROLE_ID, 'x']);
    assert.deepEqual(roleIdsOf(boss), [config.OWNER_ROLE_ID, 'x']);
    assert.deepEqual(actorOf(boss), { id: '1', roleIds: [config.OWNER_ROLE_ID, 'x'] });
    assert.deepEqual([actorOf(null), actorOf(undefined)], [null, null]);
    assert.deepEqual([memberOwns(boss), memberOwns(null), memberOwns(discord('2', []))], [true, false, false]);
    const lead = discord('3', [config.MANAGER_ROLE_IDS[0]]);
    assert.deepEqual([memberOwns(lead), memberManages(lead), memberManages(undefined)], [false, true, false]);
});
