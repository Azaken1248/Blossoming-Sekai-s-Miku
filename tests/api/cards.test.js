import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { escapeHtml, escapeXml, stripEmojis, wrapText } from '../../API/cards/text.ts';
import { drawIdCard } from '../../API/cards/idCard.ts';
import { drawProfileCard } from '../../API/cards/profileCard.ts';
import { redirectPage, sharePage } from '../../API/cards/sharePages.ts';
import { createStickerPicker } from '../../API/cards/stickers.ts';
import { importOptionalDefault } from '../../API/optionalModule.ts';

describe('text', () => {
    test('escapes every XML and HTML special character', () => {
        assert.equal(
            escapeXml(`<a href="x">Tom & 'Jerry'</a>`),
            '&lt;a href=&quot;x&quot;&gt;Tom &amp; &apos;Jerry&apos;&lt;/a&gt;',
        );
        assert.equal(
            escapeHtml(`<a href="x">Tom & 'Jerry'</a>`),
            '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#039;Jerry&#039;&lt;/a&gt;',
        );
        assert.equal(escapeXml('&lt;'), '&amp;lt;');
    });
    test('strips emoji and trims', () => {
        assert.equal(stripEmojis(' 🌸 Miku ❤️ '), 'Miku');
    });
    test('wraps at the last space before the limit', () => {
        assert.deepEqual(wrapText('short', 10), ['short', '']);
        assert.deepEqual(wrapText('one two three', 8), ['one two', 'three']);
    });
    test('cuts a word with no space and shortens a long second line', () => {
        assert.deepEqual(wrapText('abcdefghij', 4), ['abcd', 'fghij'.slice(0, 1) + '...']);
        assert.deepEqual(wrapText('aaaa bbbbbbbbbb', 6), ['aaaa', 'bbb...']);
    });
});

const idCard = (changes = {}) =>
    drawIdCard({
        discordId: '1',
        rawUsername: 'Miku',
        isOnHiatus: false,
        rawStrikesVal: 'Clean Record',
        rawJoinedAt: '1/1/2026',
        rawMikuDescription: 'short',
        serverRoles: [],
        workRoles: [],
        tasksCompleted: 0,
        avatarB64: '',
        decorB64: '',
        ...changes,
    });

describe('id card', () => {
    test('a one-line quote sits lower and the second line is left out', () => {
        const svg = idCard();
        assert.match(svg, /y="150" class="insight-text">short/);
        assert.doesNotMatch(svg, /y="168"/);
    });
    test('a two-line quote and two roles of each kind', () => {
        const svg = idCard({
            rawMikuDescription: 'word '.repeat(20),
            serverRoles: ['A', 'B'],
            workRoles: ['C', '-'],
            isOnHiatus: true,
        });
        assert.match(svg, /y="142" class="insight-text">/);
        assert.match(svg, /y="160" class="insight-text">/);
        assert.match(svg, />B<\/text>/);
        assert.doesNotMatch(svg, />-<\/text>/);
        assert.match(svg, />On Hiatus</);
    });
    test('defaults the role tags and shortens a long name', () => {
        const svg = idCard({ rawUsername: 'A very long display name' });
        assert.match(svg, />Member</);
        assert.match(svg, />No tasks yet</);
        assert.match(svg, />A very long displa\.\.\.</);
    });
});

describe('profile card', () => {
    test('falls back for every missing field', () => {
        const svg = drawProfileCard({ discordId: '', username: '' }, {}, []);
        assert.match(svg, /aria-label="Unknown User profile card"/);
        assert.match(svg, /ID: unknown/);
        assert.match(svg, /Server Roles: Crew Member/);
        assert.match(svg, /Work Roles: No task role data/);
        assert.match(svg, /seed=miku/);
        assert.match(svg, /Joined: Unknown/);
        assert.match(svg, /Strikes: 0/);
        assert.match(svg, /Tasks Done: 0/);
        assert.match(svg, />This teammate keeps adding sparkles to Sekai!</);
        assert.doesNotMatch(svg, /<image x="930"/);
        assert.match(drawProfileCard({ discordId: '' }, {}, []), /seed=Miku%20Fan/);
    });
    test('uses the stored roles, the stored picture and the name as a seed', () => {
        const stored = drawProfileCard({ discordId: '', username: 'va', roles: ['VA'], profileImageUrl: 'p' }, {}, [
            's',
        ]);
        assert.match(stored, /Server Roles: VA/);
        assert.match(stored, /href="p"/);
        assert.match(stored, /<image x="930"/);
        assert.doesNotMatch(stored, /<image x="1010"/);
        assert.match(stored, />va keeps adding sparkles/);
        assert.match(drawProfileCard({ discordId: '', username: 'va' }, {}, []), /seed=va/);
    });
    test('prefers the live roles, the avatar and the description', () => {
        const svg = drawProfileCard(
            {
                discordId: '7',
                username: 'va',
                actualRoles: ['A', 'B', 'C'],
                roles: ['X'],
                avatarUrl: 'a',
                mikuDescription: 'hi',
                strikes: 2,
                isOnHiatus: true,
                joinedAt: '2026-01-10',
            },
            { tasksCompleted: 4, topTaskRoles: ['T'] },
            ['s1', 's2'],
        );
        assert.match(svg, /Server Roles: A • B</);
        assert.match(svg, /Work Roles: T</);
        assert.match(svg, /href="a"/);
        assert.match(svg, />hi</);
        assert.match(svg, />On Hiatus</);
        assert.match(svg, /Strikes: 2/);
        assert.match(svg, /Tasks Done: 4/);
        assert.match(svg, /<image x="1010"/);
    });
});

describe('share pages', () => {
    test('the redirect page falls back for missing fields', () => {
        const html = redirectPage({ discordId: '1' }, 'https://web');
        assert.match(html, /Sekai User's Sekai Profile/);
        assert.match(html, /Roles: Crew Member/);
        assert.match(html, /Strikes: 0\/3/);
        assert.match(html, /#94e2d5/);
        assert.match(html, /url=https:\/\/web\/profile\.html\?discordId=1/);
    });
    test('the redirect page shows strikes in red', () => {
        const html = redirectPage(
            { discordId: '1', username: 'va', strikes: 1, roles: ['VA'], tasksCompleted: 2 },
            'w',
        );
        assert.match(html, /#f38ba8/);
        assert.match(html, /Roles: VA/);
        assert.match(html, /Tasks Completed: 2/);
    });
    test('the share page falls back for missing fields', () => {
        const html = sharePage({ discordId: '1' }, 'https://api');
        assert.match(html, /Sekai User • Blossoming Sekai Profile/);
        assert.match(html, /User • 0 tasks done • Active • 0 strike\(s\) • Miku-approved teammate!/);
        assert.match(html, /<div class="title">Sekai User<\/div>/);
    });
});

describe('stickers', () => {
    test('no folder means no stickers', () => {
        assert.deepEqual(createStickerPicker(path.join(os.tmpdir(), 'no-such-sticker-folder'))(), []);
    });
    test('skips a sticker that cannot be read and picks in shuffled order', () => {
        const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'stickers-'));
        fs.writeFileSync(path.join(folder, 'PNG 1.png'), 'one');
        fs.writeFileSync(path.join(folder, 'PNG 2.png'), 'two');
        fs.mkdirSync(path.join(folder, 'PNG 3.png'));
        fs.writeFileSync(path.join(folder, 'other.png'), 'x');
        const pick = createStickerPicker(folder, () => 0);
        assert.deepEqual(pick(3).sort(), ['data:image/png;base64,b25l', 'data:image/png;base64,dHdv']);
        const defaults = createStickerPicker(folder)();
        assert.ok(defaults.length <= 2 && defaults.every((uri) => uri.startsWith('data:image/png;base64,')));
        fs.rmSync(folder, { recursive: true });
    });
});

describe('optional modules', () => {
    test('passes on a thrown value that is not an error', async () => {
        const url = new URL('file:///x/missing.js');
        await assert.rejects(
            importOptionalDefault(url, async () => {
                throw null;
            }),
            (value) => value === null,
        );
    });
});
