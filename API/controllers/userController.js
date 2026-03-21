import * as userUtils from '../../Utils/DBUtils/userUtils.js';
import User from '../../DB/Schemas/user.js';
import Assignment from '../../DB/Schemas/assignment.js';
import config from '../../config.js';
import configProd from '../../configProd.js';

const DISCORD_API = 'https://discord.com/api/v10';
const roleCache = {
    guildId: null,
    expiresAt: 0,
    roleMap: new Map()
};

const memberCache = {
    guildId: null,
    expiresAt: 0,
    memberMap: new Map()
};

const buildConfigRoleMap = () => {
    const map = new Map();
    const ruleSets = [config?.RULES, configProd?.RULES].filter(Boolean);

    for (const rules of ruleSets) {
        Object.entries(rules).forEach(([roleId, value]) => {
            if (!map.has(roleId) && value?.name) {
                map.set(roleId, String(value.name).replaceAll('_', ' '));
            }
        });
    }

    return map;
};

const fallbackRoleMap = buildConfigRoleMap();

const getDiscordAuth = () => {
    const botToken = process.env.BOT_TOKEN || process.env.DISCORD_TOKEN;
    const guildId = process.env.GUILD_ID || process.env.DISCORD_GUILD_ID || process.env.SERVER_GUILD_ID;
    return { botToken, guildId };
};

const buildAvatarUrl = (discordId, avatarHash) => {
    if (!discordId || !avatarHash) return null;
    const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.${ext}?size=512`;
};

const fetchDiscordJson = async (path, botToken) => {
    const response = await fetch(`${DISCORD_API}${path}`, {
        headers: {
            Authorization: `Bot ${botToken}`
        }
    });

    if (!response.ok) return null;
    return await response.json();
};

const fetchDiscordWithResponse = async (path, botToken) => {
    return await fetch(`${DISCORD_API}${path}`, {
        headers: {
            Authorization: `Bot ${botToken}`
        }
    });
};

const getGuildRoleMap = async (guildId, botToken) => {
    const now = Date.now();
    if (roleCache.guildId === guildId && roleCache.expiresAt > now && roleCache.roleMap.size > 0) {
        return roleCache.roleMap;
    }

    const roles = await fetchDiscordJson(`/guilds/${guildId}/roles`, botToken);
    if (!Array.isArray(roles)) {
        return roleCache.roleMap;
    }

    const map = new Map(roles.map(role => [role.id, role.name]));
    roleCache.guildId = guildId;
    roleCache.expiresAt = now + (10 * 60 * 1000);
    roleCache.roleMap = map;
    return map;
};

const getGuildMembersMap = async (guildId, botToken) => {
    const now = Date.now();
    if (memberCache.guildId === guildId && memberCache.expiresAt > now && memberCache.memberMap.size > 0) {
        return memberCache.memberMap;
    }

    const allMembers = [];
    let after = null;

    while (true) {
        const suffix = after ? `?limit=1000&after=${after}` : '?limit=1000';
        const response = await fetchDiscordWithResponse(`/guilds/${guildId}/members${suffix}`, botToken);
        if (!response.ok) {
            break;
        }

        const chunk = await response.json();
        if (!Array.isArray(chunk) || chunk.length === 0) {
            break;
        }

        allMembers.push(...chunk);
        if (chunk.length < 1000) {
            break;
        }

        after = chunk[chunk.length - 1]?.user?.id;
        if (!after) {
            break;
        }
    }

    const map = new Map(allMembers
        .filter(member => member?.user?.id)
        .map(member => [member.user.id, member]));

    memberCache.guildId = guildId;
    memberCache.expiresAt = now + (2 * 60 * 1000);
    memberCache.memberMap = map;
    return map;
};

const getDiscordProfileAndRoles = async (discordId) => {
    const { botToken, guildId } = getDiscordAuth();
    if (!botToken) {
        return { avatarUrl: null, roles: [] };
    }

    try {
        const [user, member] = await Promise.all([
            fetchDiscordJson(`/users/${discordId}`, botToken),
            guildId ? fetchDiscordJson(`/guilds/${guildId}/members/${discordId}`, botToken) : Promise.resolve(null)
        ]);

        const avatarUrl = buildAvatarUrl(discordId, user?.avatar);

        let roles = [];
        if (guildId && member?.roles?.length) {
            const roleMap = await getGuildRoleMap(guildId, botToken);
            roles = member.roles
                .map(roleId => roleMap.get(roleId))
                .filter(Boolean)
                .filter(roleName => roleName !== '@everyone');
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
        .map(roleValue => fallbackRoleMap.get(roleValue) || roleValue)
        .filter(Boolean)
        .filter(roleName => roleName !== '@everyone');
};

const getDisplayUsername = (user, guildMember) => {
    const discordUser = guildMember?.user;
    return discordUser?.global_name || discordUser?.username || user.username || 'Unknown User';
};

const buildAvatarFromGuildMember = (guildMember) => {
    const discordUser = guildMember?.user;
    if (!discordUser?.id || !discordUser?.avatar) return null;
    return buildAvatarUrl(discordUser.id, discordUser.avatar);
};

const getMemberRoleNames = (guildMember, guildRoleMap) => {
    const roleIds = Array.isArray(guildMember?.roles) ? guildMember.roles : [];
    return roleIds
        .map(roleId => guildRoleMap.get(roleId))
        .filter(Boolean)
        .filter(roleName => roleName !== '@everyone');
};

export const listUsers = async (req, res) => {
    try {
        const users = await userUtils.listUsers({
            limit: req.query.limit,
            search: req.query.search
        });

        const { botToken, guildId } = getDiscordAuth();
        if (!botToken || !guildId) {
            const data = users.map(user => ({
                ...user,
                storedRoles: mapStoredRolesToNames(Array.isArray(user.roles) ? user.roles : []),
                actualRoles: mapStoredRolesToNames(Array.isArray(user.roles) ? user.roles : [])
            }));
            return res.json({ success: true, count: data.length, data });
        }

        const [guildRoleMap, guildMembersMap] = await Promise.all([
            getGuildRoleMap(guildId, botToken),
            getGuildMembersMap(guildId, botToken)
        ]);

        const data = users
            .map(user => {
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
                    actualRoles: actualRoles.length ? actualRoles : storedRoles
                };
            })
            .filter(Boolean);

        return res.json({ success: true, count: data.length, data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const createUser = async (req, res) => {
    try {
        const { discordId, username } = req.body;
        if (!discordId || !username) {
            return res.status(400).json({ error: 'discordId and username are required' });
        }
        const user = await userUtils.findOrCreateUser(discordId, username);
        res.status(201).json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getUser = async (req, res) => {
    try {
        const user = await userUtils.getUserProfile(req.params.discordId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const addStrike = async (req, res) => {
    try {
        const strikes = await userUtils.addStrikeByDiscordId(req.params.discordId);
        if (strikes === null) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ success: true, strikes });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const removeStrike = async (req, res) => {
    try {
        const strikes = await userUtils.removeStrikeByDiscordId(req.params.discordId);
        res.json({ success: true, strikes });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getUserSummary = async (req, res) => {
    try {
        const user = await User.findOne({ discordId: req.params.discordId })
            .select('discordId username strikes isOnHiatus roles joinedAt')
            .lean();

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const assignments = await Assignment.find({ discordUserId: req.params.discordId })
            .select('status roleName')
            .lean();

        const tasksCompleted = assignments.filter(a => a.status === 'COMPLETED').length;
        const taskRoleCounts = assignments.reduce((accumulator, assignment) => {
            const role = assignment.roleName || 'Unknown';
            accumulator[role] = (accumulator[role] || 0) + 1;
            return accumulator;
        }, {});

        const topTaskRoles = Object.entries(taskRoleCounts)
            .sort((left, right) => right[1] - left[1])
            .slice(0, 3)
            .map(([role]) => role);

        const discordData = await getDiscordProfileAndRoles(req.params.discordId);
        const mappedStoredRoles = mapStoredRolesToNames(Array.isArray(user.roles) ? user.roles : []);
        const { botToken, guildId } = getDiscordAuth();

        let guildMember = null;
        let guildRoleMap = new Map();
        if (botToken && guildId) {
            const [membersMap, rolesMap] = await Promise.all([
                getGuildMembersMap(guildId, botToken),
                getGuildRoleMap(guildId, botToken)
            ]);
            guildMember = membersMap.get(req.params.discordId) || null;
            guildRoleMap = rolesMap;
        }

        if (botToken && guildId && !guildMember) {
            return res.status(404).json({ error: 'User is not a member of the configured Discord guild' });
        }

        const guildRoles = getMemberRoleNames(guildMember, guildRoleMap);
        const actualRoles = guildRoles.length > 0
            ? guildRoles
            : (mappedStoredRoles.length > 0 ? mappedStoredRoles : topTaskRoles);

        const derivedWorkRoles = topTaskRoles.length > 0
            ? topTaskRoles
            : actualRoles.slice(0, 3);

        const avatarUrl = buildAvatarFromGuildMember(guildMember) || discordData.avatarUrl;
        const username = getDisplayUsername(user, guildMember);
        const mikuDescription = buildMikuDescription({
            username,
            strikes: user.strikes || 0,
            isOnHiatus: !!user.isOnHiatus,
            tasksCompleted,
            topTaskRoles: derivedWorkRoles
        });

        return res.json({
            success: true,
            data: {
                ...user,
                username,
                avatarUrl,
                storedRoles: mappedStoredRoles,
                actualRoles,
                totalAssignments: assignments.length,
                tasksCompleted,
                topTaskRoles: derivedWorkRoles,
                mikuDescription
            }
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

export const generateShareCard = async (req, res) => {
    try {
        const user = await userUtils.getUserProfile(req.params.discordId);
        if (!user) {
            return res.status(404).send('User not found');
        }

        const embedColor = user.strikes > 0 ? "#f38ba8" : "#94e2d5";
        const statusText = user.isOnHiatus ? "💤 On Hiatus" : "✨ Active Member";
        const rolesText = user.roles && user.roles.length ? user.roles.join(', ') : 'Crew Member';

        const FRONTEND_URL = 'https://sekai.azaken.com'

        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>${user.username}'s Sekai Profile</title>
            
            <meta property="og:title" content="🌸 ${user.username}'s Sekai ID Card" />
            <meta property="og:type" content="profile" />
            <meta property="og:description" content="Roles: ${rolesText}\\nStatus: ${statusText}\\nTasks Completed: ${user.tasksCompleted || 0}\\nStrikes: ${user.strikes}/3" />
            <meta name="theme-color" content="${embedColor}">
            <meta name="twitter:card" content="summary">
            
            <meta http-equiv="refresh" content="0; url='${FRONTEND_URL}/profile.html?discordId=${user.discordId}'" />
        </head>
        <body style="background-color: #1e1e2e; color: #cdd6f4; font-family: sans-serif; text-align: center; padding: 50px;">
            <h2>Redirecting to ${user.username}'s profile...</h2>
            <p>If you are not redirected, <a href="${FRONTEND_URL}/profile.html?discordId=${user.discordId}" style="color: #94e2d5;">click here</a>.</p>
        </body>
        </html>
        `;

        res.send(html);
    } catch (error) {
        console.error("Error generating share card:", error);
        res.status(500).send("Error generating card");
    }
};

export const generateCardImage = async (req, res) => {
    try {
        const user = await userUtils.getUserProfile(req.params.discordId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        let puppeteer;
        try {
            puppeteer = (await import('puppeteer')).default;
        } catch (importError) {
            console.error('Puppeteer not installed:', importError.message);
            return res.status(503).json({ 
                error: 'Image generation service unavailable. Please install puppeteer: npm install puppeteer',
                message: importError.message 
            });
        }

        let browser;
        try {
            browser = await puppeteer.launch({
                headless: 'new',
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',  // Use /tmp instead of /dev/shm
                    '--single-process'           // For limited memory environments
                ]
            });
        } catch (launchError) {
            console.error('Failed to launch browser:', launchError.message);
            return res.status(503).json({ 
                error: 'Failed to launch browser. Ensure chromium/google-chrome is installed on your system.',
                message: launchError.message 
            });
        }

        try {
            const page = await browser.newPage();

            // Set viewport to match card dimensions
            await page.setViewport({
                width: 600,
                height: 1200,
                deviceScaleFactor: 1
            });

            // Navigate to profile page with extended timeout
            const profileUrl = `https://sekai.azaken.com/profile.html?discordId=${encodeURIComponent(user.discordId)}`;
            console.log(`[CARD-IMAGE] Generating card image for ${user.username} (${user.discordId})`);
            
            await page.goto(profileUrl, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });

            // Wait for card to load
            await page.waitForSelector('.sekai-id-card', { timeout: 10000 });

            // Get the card element and take screenshot
            const cardElement = await page.$('.capture-wrapper');
            
            if (!cardElement) {
                await browser.close();
                return res.status(500).json({ error: 'Card element not found on page' });
            }

            // Take screenshot of just the card
            const screenshot = await cardElement.screenshot({
                type: 'png',
                encoding: 'binary'
            });

            // Send as image
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Content-Disposition', `attachment; filename="sekai-card-${user.username}.png"`);
            res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
            res.send(screenshot);

            console.log(`[CARD-IMAGE] ✅ Successfully generated card for ${user.username}`);

        } finally {
            try {
                await browser.close();
            } catch (closeError) {
                console.warn('Error closing browser:', closeError.message);
            }
        }

    } catch (error) {
        console.error("Error generating card image:", error);
        res.status(500).json({ 
            error: error.message,
            type: error.constructor.name 
        });
    }
};