import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAssignment } from '../../API/controllers/assignmentController.ts';
import { createUser } from '../../API/controllers/memberWrites.ts';

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
