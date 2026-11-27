import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import greeting from '../../API/routes/greeting.js';

test('greets by name', async () => {
    const app = express().use('/greeting', greeting);
    const response = await request(app).get('/greeting?name=Miku');
    assert.equal(response.text, '<p>Hello Miku</p>');
});
