import { test } from 'node:test';
import assert from 'node:assert/strict';
import config from '../config.js';
import { COMMAND_DEFINITIONS } from '../Discord/definitions.ts';
import { refusalFor } from '../Discord/views/refusals.ts';
import { DomainError } from '../Utils/domain/errors.ts';
import { COMMANDS } from '../Discord/router.ts';
import {
    HIATUS_DECISION_DENIAL,
    commandDenial,
    notOnboarded,
    taskDecisionDenial,
} from '../Discord/views/permissions.ts';
import {
    APPROVAL_POLICY,
    COMMAND_POLICY,
    createPermissions,
    isApprovalAction,
    isCommandName,
} from '../Utils/permissions.ts';

const { hasPermission, isAdmin, isManager, isManagerOrOwner, isOwner } = createPermissions(config);

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

test('every registered slash command has exactly one policy and one handler', () => {
    const registered = COMMAND_DEFINITIONS.map((definition) => definition.name).sort();
    assert.deepEqual(Object.keys(COMMAND_POLICY).sort(), registered);
    assert.deepEqual(Object.keys(COMMANDS).sort(), registered);
});

test('never treats an inherited property name as a command or an approval', () => {
    assert.deepEqual(['assign', 'constructor', 'toString', 'dance'].map(isCommandName), [true, false, false, false]);
    assert.deepEqual(['submit', 'hiatus', 'constructor', 'history'].map(isApprovalAction), [true, true, false, false]);
});

test('has wording for every refusal a policy can produce', () => {
    for (const [command, { permission }] of Object.entries(COMMAND_POLICY)) {
        if (permission === 'anyone') continue;
        assert.notEqual(commandDenial(command).content, "You don't have permission to do that.", command);
    }
    for (const action of Object.keys(APPROVAL_POLICY).filter((name) => name !== 'hiatus')) {
        for (const decision of ['approve', 'deny']) assert.ok(taskDecisionDenial(action, decision).content);
    }
    assert.ok(HIATUS_DECISION_DENIAL.content);
});

test('falls back to a generic denial for a command without its own wording', () => {
    assert.deepEqual(commandDenial('help'), { content: "You don't have permission to do that." });
});

test('words a missing onboarding differently only for a member asking for their own hiatus', () => {
    const generic = 'Looks like this user needs to be onboarded first! Ask an owner to help~ ♪';
    assert.equal(notOnboarded('submit', true).content, generic);
    assert.equal(notOnboarded('hiatus', false).content, generic);
    assert.equal(
        notOnboarded('hiatus', true).content,
        'You need to be onboarded before requesting a hiatus! Talk to an owner to get started~ ♪',
    );
});

test('rethrows a refusal it has no wording for, unchanged', () => {
    const error = new DomainError('NO_TASKS');
    assert.throws(
        () => refusalFor(error, {}),
        (thrown) => thrown === error,
    );
    assert.deepEqual(refusalFor(error, { NO_TASKS: () => 'none' }), { content: 'none' });
});
