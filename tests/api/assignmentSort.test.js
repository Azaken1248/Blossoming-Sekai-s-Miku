import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startDatabase } from '../support/database.js';

const ROUTE = '/api/v1/analytics/assignments';

let database;
let app;

before(async () => {
    database = await startDatabase('sekai_api_sort');
    ({ default: app } = await import('../../API/app.ts'));
});

beforeEach(async () => {
    await database.reset();
    await database
        .db()
        .collection('assignments')
        .insertMany([
            { taskName: 'middle', assignedAt: new Date('2026-02-01'), deadline: new Date('2026-03-03') },
            { taskName: 'oldest', assignedAt: new Date('2026-01-01'), deadline: new Date('2026-03-01') },
            { taskName: 'newest', assignedAt: new Date('2026-03-01'), deadline: new Date('2026-03-02') },
        ]);
});

after(() => database.stop());

const namesFor = async (query) => {
    const response = await request(app).get(ROUTE).query(query).expect(200);
    return response.body.data.map((task) => task.taskName);
};

test('the dashboard default, newest first by createdAt, returns tasks by assignment date', async () => {
    assert.deepEqual(await namesFor({ sort: '-createdAt' }), ['newest', 'middle', 'oldest']);
});

test('the dashboard option oldest first by createdAt returns tasks by assignment date', async () => {
    assert.deepEqual(await namesFor({ sort: 'createdAt' }), ['oldest', 'middle', 'newest']);
});

test('sorts by an allowed field, and newest first when no sort is given', async () => {
    assert.deepEqual(await namesFor({ sort: 'deadline' }), ['oldest', 'newest', 'middle']);
    assert.deepEqual(await namesFor({}), ['newest', 'middle', 'oldest']);
    assert.deepEqual(await namesFor({ sort: ' , ' }), ['newest', 'middle', 'oldest']);
});

test('still refuses a field that is not sortable', async () => {
    const response = await request(app).get(ROUTE).query({ sort: '-userId' }).expect(400);
    assert.match(response.body.error, /^Cannot sort by "userId"/);
});
