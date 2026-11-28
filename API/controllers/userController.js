import * as records from '../../Utils/DBUtils/apiRecords.ts';
import { members } from '../../Utils/DBUtils/index.ts';
import User from '../../DB/Schemas/user.ts';
import Assignment from '../../DB/Schemas/assignment.ts';
import config from '../../config.js';
import { importOptionalDefault } from '../optionalModule.js';
import { buildRoleNames } from '../roleNames.js';
import sharp from 'sharp';
import { MAX_STRIKES } from '../../Utils/domain/strikes.ts';
import { SearchTooLongError } from '../../Utils/DBUtils/searchPattern.ts';
import { avatarUrl as discordAvatarUrl, discordRest, readDiscordAuth } from '../discord/rest.ts';
import { loadImage } from '../cards/images.ts';

const configProd = await importOptionalDefault(new URL('../../configProd.js', import.meta.url));

const escapeXml = (unsafe) => {
    if (!unsafe) return '';
    return String(unsafe).replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<':
                return '&lt;';
            case '>':
                return '&gt;';
            case '&':
                return '&amp;';
            case "'":
                return '&apos;';
            case '"':
                return '&quot;';
            default:
                return c;
        }
    });
};

/** HTML-context escaping. &#039; rather than &apos; so it is safe in HTML4 too. */
const escapeHtml = (unsafe) => {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
};

const stripEmojis = (str) => {
    if (!str) return '';
    return str
        .replace(/\p{Emoji_Presentation}/gu, '')
        .replace(/\p{Emoji}\uFE0F/gu, '')
        .trim();
};

const wrapText = (text, maxLength) => {
    if (text.length <= maxLength) return [text, ''];
    let splitIdx = text.lastIndexOf(' ', maxLength);
    if (splitIdx === -1) splitIdx = maxLength;
    const line1 = text.substring(0, splitIdx);
    let line2 = text.substring(splitIdx + 1);
    if (line2.length > maxLength) line2 = line2.substring(0, maxLength - 3) + '...';
    return [line1, line2];
};

const fallbackRoleMap = buildRoleNames(config, configProd);

const getDiscordProfileAndRoles = async (discordId) => {
    const { botToken, guildId } = readDiscordAuth();
    if (!botToken) {
        return { avatarUrl: null, roles: [] };
    }

    try {
        const [user, member] = await Promise.all([
            discordRest.user(discordId, botToken),
            guildId ? discordRest.member(guildId, discordId, botToken) : Promise.resolve(null),
        ]);

        const avatarUrl = discordAvatarUrl(discordId, user?.avatar);

        let roles = [];
        if (guildId && member?.roles?.length) {
            const roleMap = await discordRest.roleNames(guildId, botToken);
            roles = member.roles
                .map((roleId) => roleMap.get(roleId))
                .filter(Boolean)
                .filter((roleName) => roleName !== '@everyone');
        }

        return { avatarUrl, roles };
    } catch (_error) {
        return { avatarUrl: null, roles: [] };
    }
};

const buildMikuDescription = ({ username, strikes, isOnHiatus, tasksCompleted, topTaskRoles }) => {
    const name = username || 'This teammate';

    // Hiatus - gentle and supportive
    if (isOnHiatus) {
        return `✨ ${name} is taking a lil' rest! Miku's saving up the spotlight for their next grand entrance~ 💙`;
    }

    // High strikes - encouraging and hopeful
    if (strikes >= 2) {
        return `💫 ${name} has so much potential! Miku believes in you and your amazing comeback story~ ⭐`;
    }

    // Very productive - celebratory
    if (tasksCompleted >= 15) {
        return `🎵 ${name} is a Sekai superstar! Your consistent magic keeps the whole vibe alive~ ✨💖`;
    }

    // Has top work roles - role-focused
    if (topTaskRoles?.length) {
        const roles = topTaskRoles.slice(0, 2).join(' & ');
        return `🌸 ${name} shines brightest as a${/^[aeiou]/i.test(roles) ? 'n' : ''} ${roles} creator! Miku adores your dedication~ 💚`;
    }

    // Productive (tasks done but not extreme)
    if (tasksCompleted >= 5) {
        return `🎀 ${name} keeps spreading good vibes with steady effort! Miku's cheering you on~ 💖✨`;
    }

    // Default - growing and supportive
    return `🌟 ${name} is growing brighter every day! Miku can't wait to see what magic you'll create~ 💫`;
};

const mapStoredRolesToNames = (roles = []) => {
    return roles
        .map((roleValue) => fallbackRoleMap.get(roleValue) || roleValue)
        .filter(Boolean)
        .filter((roleName) => roleName !== '@everyone');
};

const getDisplayUsername = (user, guildMember) => {
    const discordUser = guildMember?.user;
    return discordUser?.global_name || discordUser?.username || user.username || 'Unknown User';
};

const buildAvatarFromGuildMember = (guildMember) => {
    const discordUser = guildMember?.user;
    if (!discordUser?.id || !discordUser?.avatar) return null;
    return discordAvatarUrl(discordUser.id, discordUser.avatar);
};

const getMemberRoleNames = (guildMember, guildRoleMap) => {
    const roleIds = Array.isArray(guildMember?.roles) ? guildMember.roles : [];
    return roleIds
        .map((roleId) => guildRoleMap.get(roleId))
        .filter(Boolean)
        .filter((roleName) => roleName !== '@everyone');
};

export const listUsers = async (req, res) => {
    try {
        const users = await records.listUsers({
            limit: req.query.limit,
            search: req.query.search,
        });

        const { botToken, guildId } = readDiscordAuth();
        if (!botToken || !guildId) {
            const data = users.map((user) => ({
                ...user,
                storedRoles: mapStoredRolesToNames(Array.isArray(user.roles) ? user.roles : []),
                actualRoles: mapStoredRolesToNames(Array.isArray(user.roles) ? user.roles : []),
            }));
            return res.json({ success: true, count: data.length, data });
        }

        const [guildRoleMap, guildMembersMap] = await Promise.all([
            discordRest.roleNames(guildId, botToken),
            discordRest.members(guildId, botToken),
        ]);

        const data = users
            .map((user) => {
                const guildMember = guildMembersMap.get(user.discordId);
                if (!guildMember) {
                    return null;
                }

                const storedRoles = mapStoredRolesToNames(Array.isArray(user.roles) ? user.roles : []);
                const actualRoles = getMemberRoleNames(guildMember, guildRoleMap);

                return {
                    ...user,
                    username: getDisplayUsername(user, guildMember),
                    avatarUrl: buildAvatarFromGuildMember(guildMember),
                    storedRoles,
                    actualRoles: actualRoles.length ? actualRoles : storedRoles,
                };
            })
            .filter(Boolean);

        return res.json({ success: true, count: data.length, data });
    } catch (error) {
        if (error instanceof SearchTooLongError) {
            return res.status(400).json({ error: error.message });
        }
        console.error('[API] listUsers failed:', error);
        res.status(500).json({ error: 'Failed to list users' });
    }
};

const SNOWFLAKE = /^\d{17,20}$/;

export const createUser = async (req, res) => {
    try {
        const { discordId, username } = req.body ?? {};
        if (!discordId || !username) {
            return res.status(400).json({ error: 'discordId and username are required' });
        }
        // Without this the endpoint accepted any string as a user id, so a typo
        // or a stray request left a permanent junk record in the roster.
        if (!SNOWFLAKE.test(String(discordId))) {
            return res.status(400).json({ error: 'discordId must be a Discord snowflake (17-20 digits)' });
        }
        if (String(username).trim().length === 0 || String(username).length > 100) {
            return res.status(400).json({ error: 'username must be between 1 and 100 characters' });
        }

        const user = await records.findOrCreateUser(String(discordId), String(username).trim());
        res.status(201).json({ success: true, data: user });
    } catch (error) {
        console.error('[API] createUser failed:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
};

export const getUser = async (req, res) => {
    try {
        const user = await records.getUserProfile(req.params.discordId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ success: true, data: user });
    } catch (error) {
        console.error('[API] getUser failed:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
};

export const addStrike = async (req, res) => {
    try {
        const strikes = await members.addStrike(req.params.discordId);
        if (strikes === null) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ success: true, strikes });
    } catch (error) {
        console.error('[API] addStrike failed:', error);
        res.status(500).json({ error: 'Failed to add strike' });
    }
};

export const removeStrike = async (req, res) => {
    try {
        const strikes = await members.removeStrike(req.params.discordId);
        // null means no such member. Previously this returned 200 with
        // strikes: 0, which was indistinguishable from a successful removal.
        if (strikes === null) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ success: true, strikes });
    } catch (error) {
        console.error('[API] removeStrike failed:', error);
        res.status(500).json({ error: 'Failed to remove strike' });
    }
};

/**
 * Build the computed profile summary for a member.
 *
 * Extracted from the route handler so other parts of the API can call it
 * directly. It used to be reachable only over HTTP, which meant the server made
 * a network request to itself - a round trip, plus an SSRF because the URL was
 * built from the client-supplied Host header.
 *
 * Returns null when the member has no record, or `{ notInGuild: true }` when a
 * guild is configured and they are not in it.
 */
export const buildUserSummary = async (discordId) => {
    const user = await User.findOne({ discordId })
        .select('discordId username strikes isOnHiatus isDeboarded roles joinedAt')
        .lean();

    if (!user) return null;

    const assignments = await Assignment.find({ discordUserId: discordId }).select('status roleName').lean();

    const tasksCompleted = assignments.filter((a) => a.status === 'COMPLETED').length;
    const taskRoleCounts = assignments.reduce((accumulator, assignment) => {
        const role = assignment.roleName || 'Unknown';
        accumulator[role] = (accumulator[role] || 0) + 1;
        return accumulator;
    }, {});

    const topTaskRoles = Object.entries(taskRoleCounts)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([role]) => role);

    const discordData = await getDiscordProfileAndRoles(discordId);
    const mappedStoredRoles = mapStoredRolesToNames(Array.isArray(user.roles) ? user.roles : []);
    const { botToken, guildId } = readDiscordAuth();

    let guildMember = null;
    let guildRoleMap = new Map();
    if (botToken && guildId) {
        const [membersMap, rolesMap] = await Promise.all([
            discordRest.members(guildId, botToken),
            discordRest.roleNames(guildId, botToken),
        ]);
        guildMember = membersMap.get(discordId) || null;
        guildRoleMap = rolesMap;
    }

    const guildRoles = getMemberRoleNames(guildMember, guildRoleMap);
    const actualRoles =
        guildRoles.length > 0 ? guildRoles : mappedStoredRoles.length > 0 ? mappedStoredRoles : topTaskRoles;

    const derivedWorkRoles = topTaskRoles.length > 0 ? topTaskRoles : actualRoles.slice(0, 3);

    const avatarUrl = buildAvatarFromGuildMember(guildMember) || discordData.avatarUrl;
    const username = getDisplayUsername(user, guildMember);
    const mikuDescription = buildMikuDescription({
        username,
        strikes: user.strikes || 0,
        isOnHiatus: !!user.isOnHiatus,
        tasksCompleted,
        topTaskRoles: derivedWorkRoles,
    });

    return {
        ...user,
        username,
        avatarUrl,
        storedRoles: mappedStoredRoles,
        actualRoles,
        totalAssignments: assignments.length,
        tasksCompleted,
        topTaskRoles: derivedWorkRoles,
        mikuDescription,
        // Membership is reported rather than being a 404, so a member who left
        // the server still has a readable profile and share card.
        isGuildMember: Boolean(guildMember),
    };
};

export const getUserSummary = async (req, res) => {
    try {
        const summary = await buildUserSummary(req.params.discordId);
        if (!summary) {
            return res.status(404).json({ error: 'User not found' });
        }
        return res.json({ success: true, data: summary });
    } catch (error) {
        console.error('[API] getUserSummary failed:', error);
        return res.status(500).json({ error: 'Failed to build user summary' });
    }
};

export const generateShareCard = async (req, res) => {
    try {
        const user = await records.getUserProfile(req.params.discordId);
        if (!user) {
            return res.status(404).send('User not found');
        }

        const embedColor = user.strikes > 0 ? '#f38ba8' : '#94e2d5';
        const statusText = user.isOnHiatus ? '💤 On Hiatus' : '✨ Active Member';
        const rolesText = user.roles && user.roles.length ? user.roles.join(', ') : 'Crew Member';

        // Every interpolation below goes through escapeHtml. Usernames and role
        // names come from Discord and may contain quotes or angle brackets,
        // which previously broke out of the meta tag attributes.
        const safeUsername = escapeHtml(user.username || 'Sekai User');
        const safeRoles = escapeHtml(rolesText);
        const safeStatus = escapeHtml(statusText);
        const safeStrikes = escapeHtml(String(user.strikes ?? 0));
        const safeCompleted = escapeHtml(String(user.tasksCompleted || 0));
        const safeDiscordId = encodeURIComponent(user.discordId);

        const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sekai.azaken.com';

        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>${safeUsername}'s Sekai Profile</title>

            <meta property="og:title" content="🌸 ${safeUsername}'s Sekai ID Card" />
            <meta property="og:type" content="profile" />
            <meta property="og:description" content="Roles: ${safeRoles}&#10;Status: ${safeStatus}&#10;Tasks Completed: ${safeCompleted}&#10;Strikes: ${safeStrikes}/${MAX_STRIKES}" />
            <meta name="theme-color" content="${embedColor}">
            <meta name="twitter:card" content="summary">

            <meta http-equiv="refresh" content="0; url=${escapeHtml(`${FRONTEND_URL}/profile.html?discordId=${safeDiscordId}`)}" />
        </head>
        <body style="background-color: #1e1e2e; color: #cdd6f4; font-family: sans-serif; text-align: center; padding: 50px;">
            <h2>Redirecting to ${safeUsername}'s profile...</h2>
            <p>If you are not redirected, <a href="${escapeHtml(`${FRONTEND_URL}/profile.html?discordId=${safeDiscordId}`)}" style="color: #94e2d5;">click here</a>.</p>
        </body>
        </html>
        `;

        res.send(html);
    } catch (error) {
        console.error('Error generating share card:', error);
        res.status(500).send('Error generating card');
    }
};

export const generateCardImage = async (req, res) => {
    try {
        const user = await records.getUserProfile(req.params.discordId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const profileUrl = `https://sekai.azaken.com/profile.html?discordId=${encodeURIComponent(user.discordId)}`;

        const imageUrl = `https://api.microlink.io/?url=${encodeURIComponent(profileUrl)}&screenshot=true&width=1000&height=1200&viewport=true`;

        res.json({
            success: true,
            imageUrl: imageUrl,
            discordId: user.discordId,
            username: user.username,
        });
    } catch (error) {
        console.error('Error generating card image:', error);
        res.status(500).json({ error: 'Failed to generate card image' });
    }
};

export const getCardImage = async (req, res) => {
    try {
        const user = await User.findOne({ discordId: req.params.discordId }).lean();
        if (!user) return res.redirect('https://sekai.azaken.com/assets/PNG%201.png');

        const assignments = await Assignment.find({ discordUserId: req.params.discordId })
            .select('status roleName')
            .lean();
        const tasksCompleted = assignments.filter((a) => a.status === 'COMPLETED').length;
        const taskRoleCounts = assignments.reduce((acc, assignment) => {
            const role = assignment.roleName || 'Unknown';
            acc[role] = (acc[role] || 0) + 1;
            return acc;
        }, {});
        const topTaskRoles = Object.entries(taskRoleCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([role]) => role);

        const discordData = await getDiscordProfileAndRoles(req.params.discordId);
        const mappedStoredRoles = mapStoredRolesToNames(Array.isArray(user.roles) ? user.roles : []);
        const { botToken, guildId } = readDiscordAuth();

        let guildMember = null;
        let guildRoleMap = new Map();
        if (botToken && guildId) {
            const [membersMap, rolesMap] = await Promise.all([
                discordRest.members(guildId, botToken),
                discordRest.roleNames(guildId, botToken),
            ]);
            guildMember = membersMap.get(req.params.discordId) || null;
            guildRoleMap = rolesMap;
        }

        const guildRoles = getMemberRoleNames(guildMember, guildRoleMap);
        const actualRoles =
            guildRoles.length > 0 ? guildRoles : mappedStoredRoles.length > 0 ? mappedStoredRoles : topTaskRoles;

        const serverRoles = actualRoles.slice(0, 2);
        const workRoles = topTaskRoles.slice(0, 2);

        const discordId = user.discordId;
        const rawUsername = getDisplayUsername(user, guildMember);
        const rawAvatarUrl =
            buildAvatarFromGuildMember(guildMember) ||
            discordData.avatarUrl ||
            `https://api.dicebear.com/9.x/initials/png?seed=${encodeURIComponent(rawUsername)}&backgroundColor=313244&textColor=94e2d5`;
        const rawStrikesVal = user.strikes ? `${user.strikes} Strikes` : 'Clean Record';
        const rawJoinedAt = user.joinedAt ? new Date(user.joinedAt).toLocaleDateString('en-US') : 'Unknown';
        const rawMikuDescription = buildMikuDescription({
            username: rawUsername,
            strikes: user.strikes || 0,
            isOnHiatus: !!user.isOnHiatus,
            tasksCompleted,
            topTaskRoles,
        });

        const username = stripEmojis(rawUsername);
        const displayUsername = username.length > 18 ? username.substring(0, 18) + '...' : username;

        const hiatusLabel = user.isOnHiatus ? 'On Hiatus' : 'Active';
        const strikesVal = stripEmojis(rawStrikesVal).substring(0, 15);
        const joinedAt = stripEmojis(rawJoinedAt);

        const [quoteLine1, quoteLine2] = wrapText(stripEmojis(rawMikuDescription), 48);
        const quoteY1 = quoteLine2 ? 142 : 150;

        const avatarB64 = await loadImage(rawAvatarUrl);
        const decorB64 = await loadImage('https://sekai.azaken.com/assets/PNG%202.png');

        const renderRole = (index, roleName, yOffset) => {
            if (!roleName || roleName === '-') return '';
            const xOffset = index === 0 ? 24 : 140;
            const cleanRole = stripEmojis(roleName).substring(0, 15);
            return `
            <rect x="${xOffset}" y="${yOffset}" width="106" height="22" rx="6" fill="#45475a" stroke="#585b70" stroke-width="1" />
            <text x="${xOffset + 53}" y="${yOffset + 15.5}" class="role-tag" text-anchor="middle">${escapeXml(cleanRole)}</text>
            `;
        };

        const svg = `<?xml version="1.0" encoding="UTF-8"?>
        <svg xmlns="http://www.w3.org/2000/svg" width="900" height="870" viewBox="0 0 450 435" role="img">
            <defs>
                <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
                    <stop offset="0%" stop-color="#94e2d5" stop-opacity="0.15"/>
                    <stop offset="100%" stop-color="#94e2d5" stop-opacity="0"/>
                </radialGradient>
                <clipPath id="avatarClip">
                    <rect x="24" y="24" width="75" height="75" rx="12" />
                </clipPath>
            </defs>

            <style>
                .title { font-family: 'Inter', sans-serif; font-size: 22.4px; font-weight: 800; fill: #cdd6f4; }
                .subtitle { font-family: 'JetBrains Mono', monospace; font-size: 13.6px; fill: #a6adc8; }
                .badge-text { font-family: 'Inter', sans-serif; font-size: 11.2px; font-weight: 700; }
                .insight-text { font-family: 'Inter', sans-serif; font-size: 14px; fill: #cdd6f4; }
                .role-title { font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 700; fill: #a6adc8; letter-spacing: 0.5px; }
                .role-tag { font-family: 'Inter', sans-serif; font-size: 12px; fill: #cdd6f4; }
                .stat-label { font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 700; fill: #a6adc8; letter-spacing: 0.5px; }
                .stat-val { font-family: 'JetBrains Mono', monospace; font-size: 19.2px; font-weight: 800; }
                .footer-text { font-family: 'JetBrains Mono', monospace; font-size: 10.4px; font-weight: 700; fill: #585b70; letter-spacing: 0.5px;}
            </style>

            <rect x="1" y="1" width="448" height="433" fill="#313244" rx="15" />
            <rect x="1" y="1" width="448" height="433" fill="none" stroke="#45475a" stroke-width="2" rx="15" />

            <circle cx="400" cy="20" r="100" fill="url(#glow)" />
            <image x="366" y="14" width="60" height="60" href="${escapeXml(decorB64)}" opacity="0.8" />

            <image x="24" y="24" width="75" height="75" href="${escapeXml(avatarB64)}" clip-path="url(#avatarClip)"/>
            <rect x="24" y="24" width="75" height="75" rx="12" fill="none" stroke="#94e2d5" stroke-width="2" />
            
            <text x="115" y="44" class="title">${escapeXml(displayUsername)}</text>
            <text x="115" y="66" class="subtitle">@${escapeXml(discordId)}</text>

            <rect x="115" y="80" width="70" height="20" rx="6" fill="#a6e3a1" fill-opacity="0.15" stroke="#a6e3a1" stroke-width="1" />
            <text x="150" y="94" class="badge-text" fill="#a6e3a1" text-anchor="middle">${escapeXml(hiatusLabel)}</text>

            <rect x="195" y="80" width="85" height="20" rx="6" fill="#89dceb" fill-opacity="0.15" stroke="#89dceb" stroke-width="1" />
            <text x="237.5" y="94" class="badge-text" fill="#89dceb" text-anchor="middle">${escapeXml(strikesVal)}</text>

            <rect x="24" y="125" width="402" height="45" rx="8" fill="#181825" stroke="#f5c2e7" stroke-dasharray="4 4" stroke-width="1" />
            <text x="34" y="148" fill="#f5c2e7" font-size="16" font-family="serif" font-weight="900">"</text>
            <text x="48" y="${quoteY1}" class="insight-text">${escapeXml(quoteLine1)}</text>
            ${quoteLine2 ? `<text x="48" y="${quoteY1 + 18}" class="insight-text">${escapeXml(quoteLine2)}</text>` : ''}

            <text x="24" y="200" class="role-title">SERVER ROLES</text>
            ${renderRole(0, serverRoles[0] || 'Member', 210)}
            ${renderRole(1, serverRoles[1] || '', 210)}

            <text x="24" y="260" class="role-title">WORK TAGS</text>
            ${renderRole(0, workRoles[0] || 'No tasks yet', 270)}
            ${renderRole(1, workRoles[1] || '', 270)}

            <rect x="24" y="310" width="195" height="65" rx="8" fill="#181825" stroke="#45475a" stroke-width="1" />
            <text x="40" y="335" class="stat-label">TASKS DONE</text>
            <text x="40" y="362" class="stat-val" fill="#94e2d5">${tasksCompleted}</text>

            <rect x="231" y="310" width="195" height="65" rx="8" fill="#181825" stroke="#45475a" stroke-width="1" />
            <text x="247" y="335" class="stat-label">JOINED DATE</text>
            <text x="247" y="362" class="stat-val" fill="#89dceb">${escapeXml(joinedAt)}</text>

            <line x1="24" y1="400" x2="426" y2="400" stroke="#45475a" stroke-width="1" />
            <text x="24" y="420" class="footer-text">SEKAI ANALYTICS CENTER</text>
            <text x="426" y="420" class="footer-text" text-anchor="end">BLOSSOMING SEKAI'S MIKU</text>
        </svg>`;

        const pngBuffer = await sharp(Buffer.from(svg)).png({ force: true, quality: 100 }).toBuffer();

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.send(pngBuffer);
    } catch (error) {
        console.error('Error generating DB sharp card:', error);
        res.redirect('https://sekai.azaken.com/assets/PNG%201.png');
    }
};
