import express from 'express';
import cors from 'cors';
import connectDB from '../DB/db.js';
import User from '../DB/Schemas/user.js';
import Assignment from '../DB/Schemas/assignment.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import sharp from 'sharp';

import userRoutes from './routes/users.js';
import assignmentRoutes from './routes/assignments.js';
import analyticsRoutes from './routes/analytics.js';

const app = express();
const PORT = 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(cors());
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

connectDB();

app.use('/api/users', userRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/v1/analytics', analyticsRoutes); 

const escapeHtml = (unsafe = '') => String(unsafe)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');

const encodeSvgText = (text = '') => String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');

const getAvatarUrl = (discordId = '', username = 'Miku Fan') => {
        const seed = encodeURIComponent(discordId || username || 'miku');
        return `https://api.dicebear.com/9.x/thumbs/svg?seed=${seed}&backgroundColor=94e2d5,cba6f7,89dceb`;
};

const getBaseUrl = (req) => `${req.protocol}://${req.get('host')}`;

const assetsDir = path.join(__dirname, '..', 'public', 'assets');

const readAssetAsDataUri = (fileName) => {
    try {
        const filePath = path.join(assetsDir, fileName);
        const data = fs.readFileSync(filePath);
        return `data:image/png;base64,${data.toString('base64')}`;
    } catch (_error) {
        return null;
    }
};

const stickerFileNames = (() => {
    try {
        return fs.readdirSync(assetsDir).filter(fileName => /^PNG\s\d+\.png$/i.test(fileName));
    } catch (_error) {
        return [];
    }
})();

const stickerUriMap = new Map(stickerFileNames.map(fileName => [fileName, readAssetAsDataUri(fileName)]));

const pickRandomStickers = (count = 2) => {
    if (!stickerFileNames.length) return [];
    const shuffled = [...stickerFileNames].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count)
        .map(fileName => stickerUriMap.get(fileName))
        .filter(Boolean);
};

const fetchUserSummaryForShare = async (req, discordId) => {
    const baseUrl = getBaseUrl(req);
    try {
        const response = await fetch(`${baseUrl}/api/users/${encodeURIComponent(discordId)}/summary`);
        if (!response.ok) return null;
        const payload = await response.json();
        return payload?.data || null;
    } catch (_error) {
        return null;
    }
};

const getUserMetrics = async (discordId) => {
    const assignments = await Assignment.find({ discordUserId: discordId })
        .select('status roleName')
        .lean();

    const tasksCompleted = assignments.filter((assignment) => assignment.status === 'COMPLETED').length;
    const roleCounts = assignments.reduce((accumulator, assignment) => {
        const roleName = assignment.roleName || 'Unknown';
        accumulator[roleName] = (accumulator[roleName] || 0) + 1;
        return accumulator;
    }, {});

    const topTaskRoles = Object.entries(roleCounts)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([roleName]) => roleName);

    return {
        totalAssignments: assignments.length,
        tasksCompleted,
        topTaskRoles
    };
};

const createProfileCardSvg = (user, metrics = {}, stickerUris = []) => {
        const username = encodeSvgText(user.username || 'Unknown User');
        const discordId = encodeSvgText(user.discordId || 'unknown');
        const strikes = Number(user.strikes || 0);
        const hiatusLabel = user.isOnHiatus ? 'On Hiatus' : 'Active';
        const joinedAt = user.joinedAt ? new Date(user.joinedAt).toLocaleDateString('en-US') : 'Unknown';
    const serverRoles = Array.isArray(user.actualRoles) && user.actualRoles.length > 0
        ? user.actualRoles.slice(0, 2).join(' • ')
        : (Array.isArray(user.roles) && user.roles.length > 0 ? user.roles.slice(0, 2).join(' • ') : 'Crew Member');
    const workRoles = Array.isArray(metrics.topTaskRoles) && metrics.topTaskRoles.length > 0 ? metrics.topTaskRoles.slice(0, 2).join(' • ') : 'No task role data';
    const avatarUrl = encodeSvgText(user.avatarUrl || user.profileImageUrl || getAvatarUrl(user.discordId, user.username));
    const completed = Number(metrics.tasksCompleted || 0);
    const mikuDescription = encodeSvgText(user.mikuDescription || `${user.username || 'This teammate'} keeps adding sparkles to Sekai!`);
    const [stickerOne, stickerTwo] = stickerUris;

        return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${username} profile card">
    <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#1e1e2e"/>
            <stop offset="100%" stop-color="#11111b"/>
        </linearGradient>
        <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#94e2d5"/>
            <stop offset="50%" stop-color="#89dceb"/>
            <stop offset="100%" stop-color="#cba6f7"/>
        </linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="20" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>

    <rect width="1200" height="630" fill="url(#bg)" rx="32"/>
    <circle cx="110" cy="80" r="80" fill="#94e2d5" opacity="0.18" filter="url(#glow)"/>
    <circle cx="1070" cy="550" r="90" fill="#cba6f7" opacity="0.16" filter="url(#glow)"/>

    <rect x="42" y="42" width="1116" height="546" rx="28" fill="#313244" opacity="0.72"/>
    <rect x="42" y="42" width="1116" height="546" rx="28" fill="none" stroke="url(#accent)" stroke-width="3"/>

    ${stickerOne ? `<image x="930" y="54" width="180" height="180" href="${stickerOne}" opacity="0.85"/>` : ''}
    ${stickerTwo ? `<image x="1010" y="430" width="140" height="140" href="${stickerTwo}" opacity="0.82"/>` : ''}

    <image x="92" y="170" width="180" height="180" href="${avatarUrl}"/>

    <text x="312" y="212" fill="#94e2d5" font-size="36" font-family="Inter,Segoe UI,sans-serif" font-weight="700">${username}</text>
    <text x="312" y="252" fill="#bac2de" font-size="24" font-family="Inter,Segoe UI,sans-serif">ID: ${discordId}</text>
    <text x="312" y="290" fill="#cdd6f4" font-size="22" font-family="Inter,Segoe UI,sans-serif">Server Roles: ${encodeSvgText(serverRoles)}</text>
    <text x="312" y="322" fill="#a6adc8" font-size="20" font-family="Inter,Segoe UI,sans-serif">Work Roles: ${encodeSvgText(workRoles)}</text>

    <rect x="312" y="350" width="190" height="54" rx="27" fill="#94e2d5" opacity="0.2"/>
    <text x="407" y="384" text-anchor="middle" fill="#94e2d5" font-size="22" font-family="Inter,Segoe UI,sans-serif" font-weight="700">${encodeSvgText(hiatusLabel)}</text>

    <rect x="524" y="350" width="220" height="54" rx="27" fill="#f5c2e7" opacity="0.2"/>
    <text x="634" y="384" text-anchor="middle" fill="#f5c2e7" font-size="22" font-family="Inter,Segoe UI,sans-serif" font-weight="700">Strikes: ${strikes}</text>

    <rect x="766" y="350" width="260" height="54" rx="27" fill="#89dceb" opacity="0.2"/>
    <text x="896" y="384" text-anchor="middle" fill="#89dceb" font-size="22" font-family="Inter,Segoe UI,sans-serif" font-weight="700">Tasks Done: ${completed}</text>

    <text x="92" y="470" fill="#89dceb" font-size="30" font-family="JetBrains Mono,monospace" font-weight="700">Blossoming Sekai's Miku</text>
    <text x="92" y="506" fill="#a6adc8" font-size="20" font-family="Inter,Segoe UI,sans-serif">Joined: ${encodeSvgText(joinedAt)} • Cute Profile Card</text>
    <text x="92" y="540" fill="#cdd6f4" font-size="18" font-family="Inter,Segoe UI,sans-serif">${mikuDescription}</text>
</svg>`;
};

app.get('/share/user/:discordId/card.svg', async (req, res) => {
        try {
        const summaryUser = await fetchUserSummaryForShare(req, req.params.discordId);
        const user = summaryUser || await User.findOne({ discordId: req.params.discordId }).lean();
                if (!user) {
                        return res.status(404).send('User not found');
                }

        const metrics = {
            tasksCompleted: user.tasksCompleted,
            topTaskRoles: user.topTaskRoles
        };
        const svg = createProfileCardSvg(user, metrics, pickRandomStickers(2));
                res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
                res.setHeader('Cache-Control', 'public, max-age=300');
                return res.send(svg);
        } catch (error) {
                return res.status(500).send('Unable to render card');
        }
});

app.get('/share/user/:discordId/card.png', async (req, res) => {
    try {
        const summaryUser = await fetchUserSummaryForShare(req, req.params.discordId);
        const user = summaryUser || await User.findOne({ discordId: req.params.discordId }).lean();
        if (!user) {
            return res.status(404).send('User not found');
        }

        const metrics = {
            tasksCompleted: user.tasksCompleted,
            topTaskRoles: user.topTaskRoles
        };
        const svg = createProfileCardSvg(user, metrics, pickRandomStickers(2));
        const pngBuffer = await sharp(Buffer.from(svg)).png({ quality: 92 }).toBuffer();
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.send(pngBuffer);
    } catch (error) {
        return res.status(500).send('Unable to render PNG card');
    }
});

app.get('/share/user/:discordId', async (req, res) => {
        try {
        const summaryUser = await fetchUserSummaryForShare(req, req.params.discordId);
        const user = summaryUser || await User.findOne({ discordId: req.params.discordId }).lean();
                if (!user) {
                        return res.status(404).send('<h1>User not found</h1>');
                }

                const baseUrl = getBaseUrl(req);
                const cardImageUrl = `${baseUrl}/share/user/${encodeURIComponent(user.discordId)}/card.png`;
                const sharePageUrl = `${baseUrl}/share/user/${encodeURIComponent(user.discordId)}`;
                const profileWebUrl = `${baseUrl}/public/profile.html?discordId=${encodeURIComponent(user.discordId)}`;
                const title = `${user.username || 'Sekai User'} • Blossoming Sekai Profile`;
        const description = `${user.username || 'User'} • ${user.tasksCompleted || 0} tasks done • ${user.isOnHiatus ? 'On Hiatus' : 'Active'} • ${user.strikes || 0} strike(s) • ${user.mikuDescription || 'Miku-approved teammate!'}`;

                const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(sharePageUrl)}" />
    <meta property="og:image" content="${escapeHtml(cardImageUrl)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(cardImageUrl)}" />
    <style>
        body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #1e1e2e; color: #cdd6f4; font-family: Inter, 'Segoe UI', sans-serif; }
        .wrap { width: min(900px, 92vw); padding: 24px; border: 1px solid #45475a; border-radius: 18px; background: #313244; }
        .title { font-size: 1.4rem; font-weight: 700; color: #94e2d5; margin-bottom: 10px; }
        .desc { color: #bac2de; margin-bottom: 16px; }
        img { width: 100%; border-radius: 14px; border: 1px solid #45475a; }
        a { color: #89dceb; }
    </style>
</head>
<body>
    <main class="wrap">
        <div class="title">${escapeHtml(user.username || 'Sekai User')}</div>
        <div class="desc">${escapeHtml(description)}</div>
        <img src="${escapeHtml(cardImageUrl)}" alt="Profile card preview" />
        <p>Open full profile page: <a href="${escapeHtml(profileWebUrl)}">${escapeHtml(profileWebUrl)}</a></p>
    </main>
</body>
</html>`;

                return res.send(html);
        } catch (error) {
                return res.status(500).send('<h1>Failed to load share page</h1>');
        }
});

app.get('/', (_req, res) => {
    const apiLandingPage = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Blossoming Sekai API Gateway</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=JetBrains+Mono:wght@600&display=swap" rel="stylesheet">
        <style>
            :root {
                --ctp-base: #1e1e2e; --ctp-surface0: #313244; --ctp-surface1: #45475a;
                --ctp-text: #cdd6f4; --ctp-subtext0: #a6adc8; --miku-primary: #94e2d5;
                --miku-secondary: #f5c2e7; --miku-accent: #89dceb; --ctp-green: #a6e3a1;
            }
            body {
                background-color: var(--ctp-base); color: var(--ctp-text);
                font-family: 'Inter', sans-serif; display: flex; flex-direction: column;
                align-items: center; justify-content: center; min-height: 100vh; margin: 0;
            }
            .container {
                background-color: var(--ctp-surface0); padding: 3rem; border-radius: 20px;
                border: 1px solid var(--ctp-surface1); box-shadow: 0 20px 40px rgba(0,0,0,0.4);
                text-align: center; max-width: 650px; width: 90%;
            }
            h1 {
                font-weight: 800; font-size: 2.2rem; margin-bottom: 0.5rem;
                background: linear-gradient(to right, var(--miku-primary), var(--miku-accent));
                -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            }
            p { color: var(--ctp-subtext0); margin-bottom: 2.5rem; font-size: 1.1rem; }
            .endpoint {
                background-color: var(--ctp-base); padding: 1.2rem; border-radius: 12px;
                font-family: 'JetBrains Mono', monospace; text-align: left;
                border-left: 4px solid var(--miku-primary); margin-bottom: 1rem;
            }
            .method { 
                color: var(--miku-secondary); font-weight: 600; margin-right: 15px; 
                background: rgba(245, 194, 231, 0.1); padding: 0.2rem 0.6rem; border-radius: 6px;
            }
            .status {
                display: inline-block; padding: 0.4rem 1rem; color: var(--ctp-green);
                background-color: rgba(166, 227, 161, 0.15); border-radius: 50px;
                font-size: 0.9rem; font-weight: 600; margin-top: 2.5rem;
                border: 1px solid rgba(166, 227, 161, 0.3);
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Blossoming Sekai API</h1>
            <p>Pure API Backend. No static files served here.</p>
            <div class="endpoint"><span class="method">USE</span> /api/users</div>
            <div class="endpoint"><span class="method">USE</span> /api/assignments</div>
            <div class="endpoint"><span class="method">USE</span> /api/v1/analytics</div>
            <div class="status">● System Operational</div>
        </div>
    </body>
    </html>
    `;
    res.send(apiLandingPage);
});

app.listen(PORT, () => {
    console.log(`API Server running strictly as an API on http://localhost:${PORT}`);
});