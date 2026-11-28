import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAssignment } from '../../API/controllers/assignmentController.ts';
import { createUser } from '../../API/controllers/memberWrites.ts';
import { recordService } from '../../Services/index.ts';
import { DomainError } from '../../Utils/domain/errors.ts';

const answer = () => {
    const sent = {};
    let finished;
    const done = new Promise((resolve) => {
        finished = resolve;
    });
    const res = {
        status(code) {
            sent.status = code;
            return this;
        },
        json(body) {
            sent.body = body;
            finished(sent);
            return this;
        },
    };
    return { res, done };
};

test('a request with no body at all is refused like an empty one', async () => {
    const user = answer();
    createUser({}, user.res);
    assert.deepEqual(await user.done, { status: 400, body: { error: 'discordId and username are required' } });
    const task = answer();
    createAssignment({}, task.res);
    assert.deepEqual(await task.done, {
        status: 400,
        body: { error: 'Missing required field(s): discordId, roleCategoryId, taskType' },
    });
});

test('a refusal the API has no answer for is logged and hidden behind a 500', async (t) => {
    t.mock.method(recordService, 'assign', async () => {
        throw new DomainError('TASK_GONE');
    });
    const errors = t.mock.method(console, 'error', () => {});
    const task = answer();
    createAssignment(
        { body: { discordId: '100000000000000003', roleCategoryId: '1449411540351713503', taskType: 'skit' } },
        task.res,
    );
    assert.deepEqual(await task.done, { status: 500, body: { error: 'Failed to create assignment' } });
    assert.equal(errors.mock.calls[0].arguments[0], '[API] createAssignment failed:');
});
