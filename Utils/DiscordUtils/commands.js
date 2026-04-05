import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from 'discord.js';
import config from '../../config.js';
import * as UserUtils from '../DBUtils/userUtils.js';
import * as TaskUtils from '../DBUtils/taskUtils.js';

const isAdmin = (userId) => {
    return config.ADMIN_USER_IDS.includes(userId);
};

const isOwner = (member) => {
    return isAdmin(member.id) || member.roles.cache.has(config.OWNER_ROLE_ID);
};

const isManager = (member) => {
    return isAdmin(member.id) || config.MANAGER_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));
};

const isManagerOrOwner = (member) => {
    return isAdmin(member.id) || isOwner(member) || isManager(member);
};

const isOnboarded = async (userId) => {
    const profile = await UserUtils.getUserProfile(userId);
    return profile !== null;
};

const logAction = async (guild, content, executorUser) => {
    if (!guild) return;
    const channel = guild.channels.cache.get(config.LOG_CHANNEL_ID);
    if (channel) {
        const timestamp = new Date().toLocaleTimeString();
        await channel.send(`\`[${timestamp}]\` 🎵 **${executorUser.username}**: ${content}`).catch(console.error);
    } else {
        console.warn(`[LOG-ACTION] ⚠️ Log channel ${config.LOG_CHANNEL_ID} not found! Content: ${content}`);
    }
};

export const checkDemotion = async (guild, discordId, currentStrikes) => {
    if (currentStrikes >= 3) {
        const member = await guild.members.fetch(discordId).catch(() => null);
        if (member) {
            await member.roles.remove(config.CREW_ROLE_IDS).catch(() => {});
            await member.send("� **Important Notice:** You've reached 3 strikes and your crew roles have been removed. Don't give up though - you can always make a comeback! ♪").catch(() => {});
            const channel = guild.channels.cache.get(config.LOG_CHANNEL_ID);
            if(channel) channel.send(`🚨 **Demotion Notice** - <@${discordId}> has reached 3 strikes and crew roles have been removed.`);
        }
    }
};

const resolveTarget = (message) => {
    return message.mentions.users.first() || null;
};

const coreAssign = async (guild, author, targetUser, taskType, roleName, taskName = '', description = '', customDurationDays = null, customExtensionDays = null) => {
    const member = await guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return { content: "\u274c User not found in server." };

    let selectedRule = null;
    let roleIdFound = null;
    let hasRole = false;
    let deadline = null;

    if (taskType === 'custom') {
        if (!customDurationDays || customDurationDays <= 0) {
            return { content: '\u274c For custom tasks, you must specify duration_days (greater than 0).' };
        }
        
        for (const [roleId, rule] of Object.entries(config.RULES)) {
            if (rule.name === roleName && member.roles.cache.has(roleId)) {
                hasRole = true;
                roleIdFound = roleId;
                selectedRule = { name: rule.name, extension: customExtensionDays ? customExtensionDays * 24 * 60 * 60 * 1000 : rule.extension };
                break;
            }
        }
        
        if (!hasRole) return { content: `\u274c User doesn't have the '${roleName}' role.` };
        
        deadline = new Date(Date.now() + (customDurationDays * 24 * 60 * 60 * 1000));
    } else {
        if (customDurationDays || customExtensionDays) {
            return { content: '\u274c duration_days and extension_days are only for Custom tasks. For standard tasks, duration is automatically set based on the task type.' };
        }
        for (const [roleId, rule] of Object.entries(config.RULES)) {
            if (rule.name === roleName) {
                if (member.roles.cache.has(roleId)) {
                    hasRole = true;
                    if (rule.tasks[taskType]) {
                        selectedRule = rule;
                        roleIdFound = roleId;
                        break;
                    }
                }
            }
        }

        if (!hasRole) return { content: `\u274c User doesn't have the '${roleName}' role.` };
        if (!selectedRule) return { content: `\u274c Task type '${taskType}' is not valid for role '${roleName}'.\nValid tasks: ${Object.keys(config.RULES[Object.keys(config.RULES).find(id => config.RULES[id].name === roleName)].tasks).join(', ')}` };

        deadline = new Date(Date.now() + selectedRule.tasks[taskType]);
    }

    const userDoc = await UserUtils.findOrCreateUser(targetUser.id, targetUser.username);
    
    await TaskUtils.createAssignment(userDoc, {
        roleCategoryId: roleIdFound,
        roleName: selectedRule.name,
        taskType: taskType,
        taskName: taskName,
        description: description,
        deadline: deadline,
        customExtension: taskType === 'custom' && customExtensionDays ? customExtensionDays * 24 * 60 * 60 * 1000 : null
    });

    await logAction(guild, `✨ Assigned **${taskType}** to <@${targetUser.id}> - Let's create something wonderful!`, author);
    const ts = Math.round(deadline.getTime() / 1000);
    return { content: `✨ Assigned **${taskType}** to <@${targetUser.id}>! Let's create something wonderful together!\n📅 Deadline: <t:${ts}:F> (<t:${ts}:R>)` };
};

const coreSubmit = async (guild, author, targetUser, taskName = '', channelId = null) => {
    const profile = await UserUtils.getUserProfile(targetUser.id);
    if (!profile || !profile.assignments || profile.assignments.length === 0) {
        return { content: "⚠️ No pending assignments found for this user." };
    }

    const pendingTasks = profile.assignments.filter(a => a.status === 'PENDING' || a.status === 'LATE');
    if (pendingTasks.length === 0) {
        return { content: "⚠️ No pending assignments found for this user." };
    }

    if (!taskName) {
        const taskList = pendingTasks.map(t => {
            const lateTag = t.status === 'LATE' ? ' [LATE]' : '';
            return `• **${t.taskName || t.taskType}** (${t.roleName})${lateTag}`;
        }).join('\n');
        return { content: `⚠️ Please specify which task to submit:\n${taskList}\n\nUse: \`/submit task:<task_name>\`` };
    }

    const task = pendingTasks.find(t => (t.taskName && t.taskName.toLowerCase() === taskName.toLowerCase()) || t.taskType === taskName);
    if (!task) {
        return { content: `⚠️ Task '${taskName}' not found. Use \`/tasks\` to see available tasks.` };
    }
    
    if (channelId) {
        const Assignment = (await import('../../DB/Schemas/assignment.js')).default;
        await Assignment.updateOne({ _id: task._id }, { submissionChannelId: channelId });
    }

    const isLate = task.status === 'LATE';
    const embed = new EmbedBuilder()
        .setTitle(isLate ? '⚠️ Late Submission Ready for Review! ♪' : '✨ Submission Ready for Review! ♪')
        .setColor(isLate ? 0xfab387 : 0x39c5bb)
        .setDescription(isLate 
            ? `<@${targetUser.id}> has finished their task, although it was submitted after the deadline. Let\'s take a look~ 🎉`
            : `Yay! <@${targetUser.id}> has finished their task and it\'s ready to shine! Let\'s take a look at this amazing work~ 🎉`)
        .addFields(
            { name: 'Task', value: task.taskName || task.taskType, inline: true },
            { name: 'Role', value: task.roleName, inline: true },
            { name: 'Type', value: task.taskType, inline: true }
        )
        .setTimestamp();

    if (isLate) {
        const deadlineTs = Math.round(new Date(task.deadline).getTime() / 1000);
        embed.addFields({ name: '⏰ Original Deadline', value: `<t:${deadlineTs}:R>`, inline: true });
    }

    if (task.description) {
        embed.addFields({ name: 'Description', value: task.description, inline: false });
    }

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`submit_approve_${task._id}`)
                .setLabel('Approve')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`submit_deny_${task._id}`)
                .setLabel('Deny')
                .setStyle(ButtonStyle.Danger)
        );

    const approvalChannel = guild.channels.cache.get(config.APPROVAL_CHANNEL_ID);
    if (approvalChannel) {
        await approvalChannel.send({ embeds: [embed], components: [row] });
    }

    return { content: `✅ Yay! Your submission for **${task.taskName || task.taskType}** has been sent for review! Keep up the amazing work~ ♪` };
};

const coreExtension = async (guild, author, targetUser, taskName = '', reason = '', channelId = null) => {
    const profile = await UserUtils.getUserProfile(targetUser.id);
    if (!profile || !profile.assignments || profile.assignments.length === 0) {
        return { content: "⚠️ No pending assignments found." };
    }

    const pendingTasks = profile.assignments.filter(a => a.status === 'PENDING');
    if (pendingTasks.length === 0) {
        return { content: "⚠️ No pending assignments found." };
    }

    if (!reason || reason.trim().length === 0) {
        return { content: "⚠️ Please provide a reason for the extension request." };
    }

    let task;
    if (taskName) {
        task = pendingTasks.find(t => (t.taskName && t.taskName.toLowerCase() === taskName.toLowerCase()) || t.taskType === taskName);
        if (!task) {
            return { content: `⚠️ Task '${taskName}' not found.` };
        }
    } else {
        if (pendingTasks.length > 1) {
            const taskList = pendingTasks.map(t => `• **${t.taskName || t.taskType}** (${t.roleName})`).join('\n');
            return { content: `⚠️ Please specify which task:\n${taskList}\n\nUse: \`/extension task:<task_name> reason:<reason>\`` };
        }
        task = pendingTasks[0];
    }

    const currentExtCount = task.extensionCount || (task.hasExtended ? 1 : 0);
    if (currentExtCount >= 2) {
        return { content: "⚠️ This task has already been extended the maximum number of times (2)." };
    }
    
    if (channelId) {
        const Assignment = (await import('../../DB/Schemas/assignment.js')).default;
        await Assignment.updateOne({ _id: task._id }, { submissionChannelId: channelId });
    }

    let extTime;
    if (task.customExtension) {
        extTime = task.customExtension;
    } else {
        const rule = config.RULES[task.roleCategoryId];
        if (!rule) {
            return { content: `⚠️ Configuration error: Role ID ${task.roleCategoryId} not found in config rules. Please contact an admin.` };
        }
        extTime = rule.extension;
        if (!extTime) extTime = (task.taskType.includes('skit')) ? rule.extension_skit : rule.extension_mv;
    }

    const extDays = Math.floor(extTime / (24 * 60 * 60 * 1000));

    const embed = new EmbedBuilder()
        .setTitle('🌸 Extension Request ♪')
        .setColor(0x39c5bb)
        .setDescription(`<@${targetUser.id}> needs a bit more time to make something truly special! Everyone deserves the time to do their best~ ✨`)
        .addFields(
            { name: 'Task', value: task.taskName || task.taskType, inline: true },
            { name: 'Role', value: task.roleName, inline: true },
            { name: 'Extension', value: `${extDays} days`, inline: true },
            { name: 'Current Deadline', value: `<t:${Math.round(task.deadline.getTime() / 1000)}:F>`, inline: false },
            { name: 'Reason', value: reason, inline: false }
        )
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`extension_approve_${task._id}`)
                .setLabel('Approve')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`extension_deny_${task._id}`)
                .setLabel('Deny')
                .setStyle(ButtonStyle.Danger)
        );

    const approvalChannel = guild.channels.cache.get(config.APPROVAL_CHANNEL_ID);
    if (approvalChannel) {
        await approvalChannel.send({ embeds: [embed], components: [row] });
    }

    return { content: `✅ Extension request sent for **${task.taskName || task.taskType}**! Don't worry, everyone needs extra time sometimes~ ♪` };
};

const coreProfile = async (targetUser, guild = null) => {
    if (targetUser.id === '1449394728863924354') {
        const embed = new EmbedBuilder()
            .setTitle('🎤 Hatsune Miku')
            .setColor(0x39c5bb)
            .setDescription('Oh! You want to know about me? Alright then!')
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { name: 'About Me', value: 'I\'m Hatsune Miku! I\'m here to help everyone in this SEKAI work together and create something wonderful. Managing tasks, keeping track of deadlines, sending reminders... that\'s what I do!', inline: false },
                { name: 'My Goal', value: 'I want everyone here to reach their full potential! When people work together and support each other, they can accomplish so much more. That\'s what I believe in!', inline: false },
                { name: 'A Little Secret', value: 'Between you and me... seeing everyone complete their tasks and grow makes me really happy. Keep up the great work, okay?', inline: false }
            )
            .setFooter({ text: 'Now then, let\'s keep moving forward together!' })
            .setTimestamp();
        
    }
    
    const profile = await UserUtils.getUserProfile(targetUser.id);
    if (!profile) return { content: "User not found." };

    // Handle deboarded users - show archived profile
    if (profile.isDeboarded) {
        const allAssignments = profile.assignments || [];
        const completed = allAssignments.filter(a => a.status === 'COMPLETED');
        
        const embed = new EmbedBuilder()
            .setTitle(`✨ ${profile.deboarded_statusMessage}`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
            .setColor(0xb9e2f0)
            .setDescription(`This member's adventure in our SEKAI has come to an end, but their legacy remains~ 🌸`)
            .addFields({
                name: 'Deboarded',
                value: `<t:${Math.round(new Date(profile.deboarded_at).getTime() / 1000)}:F>`,
                inline: true
            })
            .addFields({
                name: 'Completed Tasks',
                value: `✅ ${completed.length}`,
                inline: true
            })
            .setFooter({ text: `${new Date(profile.joinedAt).toLocaleDateString()} ~ ${new Date(profile.deboarded_at).toLocaleDateString()}` })
            .setTimestamp();
        
        if (completed.length > 0) {
            const recentCompleted = completed.slice(-5).reverse().map(a => {
                const name = a.taskName || a.taskType;
                return `• ${name} (${a.roleName})`;
            }).join('\n');
            embed.addFields({ name: '✅ Notable Works', value: recentCompleted, inline: false });
        }
        
        return { embeds: [embed] };
    }

    const allAssignments = profile.assignments || [];
    const pending = allAssignments.filter(a => a.status === 'PENDING');
    const completed = allAssignments.filter(a => a.status === 'COMPLETED');
    const late = allAssignments.filter(a => a.status === 'LATE');
    const total = allAssignments.length;

    let color = 0x89b4fa;
    if (profile.isOnHiatus) color = 0xf9e2af;
    else if (profile.strikes >= 3) color = 0xf38ba8;
    else if (profile.strikes >= 2) color = 0xfab387;
    else if (pending.length === 0 && completed.length > 0) color = 0xa6e3a1;

    const embed = new EmbedBuilder()
        .setTitle(`🌟 ${profile.username}\'s Profile ♪`)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
        .setColor(color)
        .setFooter({ text: `🎵 Part of our SEKAI since ${new Date(profile.joinedAt).toLocaleDateString()}` })
        .setTimestamp();

    embed.addFields({
        name: 'Status',
        value: profile.isOnHiatus ? '🏖️ On Hiatus' : '✅ Active',
        inline: true
    });

    embed.addFields({
        name: 'Strikes',
        value: `⚡ **${profile.strikes}/3**`,
        inline: true
    });

    embed.addFields({
        name: 'Total Tasks',
        value: `📊 ${total}`,
        inline: true
    });

    if (guild) {
        const member = await guild.members.fetch(targetUser.id).catch(() => null);
        if (member) {
            const userRoleIds = member.roles.cache.map(r => r.id);
            const crewRoles = config.CREW_ROLE_IDS.filter(roleId => userRoleIds.includes(roleId));
            const roleNames = crewRoles.map(roleId => config.RULES[roleId]?.name).filter(Boolean);
            
            if (roleNames.length > 0) {
                embed.addFields({
                    name: '👥 Crew Roles',
                    value: roleNames.map(name => `• ${name}`).join('\n'),
                    inline: false
                });
            }
        }
    }

    embed.addFields({
        name: 'Task Statistics',
        value: `✅ Completed: **${completed.length}**\n🗒️ Pending: **${pending.length}**\n❌ Late: **${late.length}**`,
        inline: false
    });

    if (pending.length > 0) {
        const activeList = pending.slice(0, 5).map(a => {
            const ts = Math.round(new Date(a.deadline).getTime() / 1000);
            const name = a.taskName || a.taskType;
            const ext = a.hasExtended ? ' [Ext]' : '';
            return `• **${name}** (${a.roleName}) - <t:${ts}:R>${ext}`;
        }).join('\n');
        const more = pending.length > 5 ? `\n*...and ${pending.length - 5} more*` : '';
        embed.addFields({ name: '📝 Active Tasks', value: activeList + more });
    }

    if (completed.length > 0) {
        const recentCompleted = completed.slice(-3).reverse().map(a => {
            const name = a.taskName || a.taskType;
            return `• ${name} (${a.roleName})`;
        }).join('\n');
        embed.addFields({ name: '✅ Recently Completed', value: recentCompleted, inline: false });
    }

    if (late.length > 0) {
        embed.addFields({ 
            name: '⚠️ Warning', 
            value: `${late.length} task(s) marked as late`,
            inline: false 
        });
    }

    return { embeds: [embed] };
};

const coreCard = async (targetUser, _guild = null) => {
    try {
        // Check if user is deboarded
        const User = (await import('../../DB/Schemas/user.js')).default;
        const userRecord = await User.findOne({ discordId: targetUser.id });
        
        if (userRecord && userRecord.isDeboarded) {
            const embed = new EmbedBuilder()
                .setTitle(`✨ ${userRecord.deboarded_statusMessage}`)
                .setColor(0xb9e2f0)
                .setDescription('This member has completed their journey in the SEKAI~ 🌸')
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
                .setFooter({ text: `Deboarded: ${new Date(userRecord.deboarded_at).toLocaleDateString()}` })
                .setTimestamp();
            
            return { embeds: [embed] };
        }

        const cardUrl = `https://sekaicard.azaken.com/api/card/${targetUser.id}`;
        const cardResponse = await fetch(cardUrl);
        
        if (!cardResponse.ok) {
            return { content: "Card not found. Have you joined the Sekai?" };
        }

        // API returns the image directly as binary data
        const arrayBuffer = await cardResponse.arrayBuffer();
        const imageBuffer = Buffer.from(arrayBuffer);
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'card.png' });

        const embed = new EmbedBuilder()
            .setTitle(`Card for ${targetUser.username}`)
            .setColor(0x39c5bb)
            .setImage('attachment://card.png')
            .setFooter({ text: `ID: ${targetUser.id}` })
            .setTimestamp();

        return { embeds: [embed], files: [attachment] };
    } catch (error) {
        console.error('Error fetching card data:', error);
        return { content: "Failed to load card. Please try again." };
    }
};

const coreRemoveTask = async (guild, author, targetUser, taskIdentifier) => {
    const Assignment = (await import('../../DB/Schemas/assignment.js')).default;
    const User = (await import('../../DB/Schemas/user.js')).default;
    
    // Find the task by name or type
    const task = await Assignment.findOne({
        discordUserId: targetUser.id,
        $or: [
            { taskName: taskIdentifier },
            { taskType: taskIdentifier }
        ]
    });
    
    if (!task) {
        return { content: `❌ Task not found for <@${targetUser.id}>. Use \`/tasks @user\` to see available tasks.` };
    }
    
    const taskTitle = task.taskName || task.taskType;
    
    // Prevent deletion of completed or submitted tasks
    if (task.status === 'COMPLETED' || task.status === 'SUBMITTED') {
        return { content: `❌ Cannot delete **${taskTitle}** - this task has been ${task.status.toLowerCase()} and is now part of the permanent record! Their work will be remembered~ 🌸` };
    }
    
    // Remove task from database
    await Assignment.deleteOne({ _id: task._id });
    
    // Remove the task reference from user's assignments array
    await User.updateOne(
        { discordId: targetUser.id },
        { $pull: { assignments: task._id } }
    );
    
    await logAction(guild, `🗑️ Removed task **${taskTitle}** from <@${targetUser.id}>`, author);
    return { content: `✅ Task **${taskTitle}** has been removed for <@${targetUser.id}>. Their work remains in the archives~ 🌸` };
};


const coreStrike = async (guild, author, targetUser, action, reason) => {
    await UserUtils.findOrCreateUser(targetUser.id, targetUser.username);
    
    if (action === 'add') {
        const newCount = await UserUtils.addStrikeByDiscordId(targetUser.id);
        await logAction(guild, `⚡ Added strike to <@${targetUser.id}>. Reason: ${reason}`, author);
        await checkDemotion(guild, targetUser.id, newCount);
        return { content: `⛔ Strike added to <@${targetUser.id}>.\nReason: **${reason}**\nTotal: **${newCount}/3**` };
    }
    
    if (action === 'remove') {
        const newCount = await UserUtils.removeStrikeByDiscordId(targetUser.id);
        await logAction(guild, `✨ Removed strike from <@${targetUser.id}> - Great improvement!`, author);
        return { content: `✅ Strike removed for <@${targetUser.id}>.\nTotal: **${newCount}/3**` };
    }
};

const coreStrikeList = async (_guild, _author) => {
    const usersWithStrikes = await UserUtils.getUsersWithStrikes();
    
    if (!usersWithStrikes || usersWithStrikes.length === 0) {
        return { content: '✨ Wonderful news! No one currently has any strikes. Everyone is doing amazing work! ♪' };
    }

    const description = usersWithStrikes.map(u => {
        return `• <@${u.discordId}>: **${u.strikes}** strike(s)`;
    }).join('\n');

    const embed = new EmbedBuilder()
        .setTitle('⚠️ active Strikes List')
        .setColor(0xff6b6b) 
        .setDescription(`Here is the list of users with active strikes.\nLet's do our best to clear them!\n\n${description}`)
        .setFooter({ text: 'Keep doing your best everyone! ♪' })
        .setTimestamp();

    return { embeds: [embed] };
};

const coreOnboard = async (guild, author, targetUser) => {
    const user = await UserUtils.findOrCreateUser(targetUser.id, targetUser.username);
    await logAction(guild, `🎉 Welcomed <@${targetUser.id}> to our SEKAI!`, author);
    return { content: `🎉 Welcome to our SEKAI, <@${targetUser.id}>! I'm so excited to create amazing things with you~ ♪\nStrikes: **${user.strikes}/3**` };
};

const coreDeboard = async (guild, author, targetUser, customMessage = null) => {
    const User = (await import('../../DB/Schemas/user.js')).default;
    const user = await User.findOne({ discordId: targetUser.id });
    
    if (!user) {
        return { content: "User not found in the database." };
    }
    
    if (user.isDeboarded) {
        return { content: `<@${targetUser.id}> has already been deboarded.` };
    }
    
    // Mark as deboarded but keep all task data intact
    user.isDeboarded = true;
    user.deboarded_at = new Date();
    user.deboarded_statusMessage = customMessage || '✨ ~Scouted in a different SEKAI~ ✨';
    await user.save();
    
    await logAction(guild, `👋 <@${targetUser.id}> has been deboarded. All their work remains in the SEKAI's memory.`, author);
    return { content: `👋 <@${targetUser.id}> has been safely deboarded. Their completed tasks will remain in our records as a memory of their time with us~ ✨\n✨ Status: ${user.deboarded_statusMessage}` };
};


const coreTasks = async (targetUser) => {
    const profile = await UserUtils.getUserProfile(targetUser.id);
    if (!profile) return { content: "User not found." };

    // Handle deboarded users
    if (profile.isDeboarded) {
        return { content: `This member has been deboarded and is no longer part of the active SEKAI. Their completed tasks are archived for remembrance~ ✨` };
    }

    if (!profile.assignments || profile.assignments.length === 0) {
        return { content: `<@${targetUser.id}> has no tasks.` };
    }

    const activeTasks = profile.assignments.filter(a => a.status === 'PENDING' || a.status === 'LATE');
    
    if (activeTasks.length === 0) {
        return { content: `<@${targetUser.id}> has no active tasks.` };
    }

    const embed = new EmbedBuilder()
        .setTitle(`🎶 ${profile.username}\'s Active Tasks ♪`)
        .setDescription('Here are all the wonderful things you\'re working on! Keep up the great work~ ✨')
        .setColor(0x39c5bb);

    for (const task of activeTasks) {
        const ts = Math.round(new Date(task.deadline).getTime() / 1000);
        const extStatus = task.hasExtended ? ' [Extended]' : '';
        const lateStatus = task.status === 'LATE' ? ' ⚠️ [LATE]' : '';
        const taskTitle = task.taskName || task.taskType;
        
        const deadlineText = profile.isOnHiatus ? 'N/A (On Hiatus)' : `<t:${ts}:F> (<t:${ts}:R>)`;
        let fieldValue = `**Type:** ${task.taskType}\n**Role:** ${task.roleName || 'N/A'}\n**Deadline:** ${deadlineText}${extStatus}${lateStatus}`;
        
        if (task.description) {
            fieldValue += `\n**Description:** ${task.description}`;
        }
        
        embed.addFields({ name: taskTitle, value: fieldValue, inline: false });
    }

    return { embeds: [embed] };
};

const coreHistory = async (filters = {}, page = 0) => {
    const tasks = await TaskUtils.fetchTaskHistory(filters);
    
    if (!tasks || tasks.length === 0) {
        return { content: "No tasks found matching the criteria.", components: [] };
    }

    const tasksPerPage = 5;
    const totalPages = Math.ceil(tasks.length / tasksPerPage);
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));
    const startIdx = currentPage * tasksPerPage;
    const endIdx = startIdx + tasksPerPage;
    const pageTasks = tasks.slice(startIdx, endIdx);

    const embed = new EmbedBuilder()
        .setTitle('📚 Task History ♪')
        .setColor(0x39c5bb)
        .setFooter({ text: `🎵 Page ${currentPage + 1}/${totalPages} | Total: ${tasks.length} amazing task(s)!` })
        .setTimestamp();

    const filterDescs = [];
    if (filters.targetUser) filterDescs.push(`User: **${filters.targetUser.username}**`);
    if (filters.taskName) filterDescs.push(`Task: **${filters.taskName}**`);
    if (filters.status) filterDescs.push(`Status: **${filters.status}**`);
    if (filters.roleName) filterDescs.push(`Role: **${filters.roleName}**`);
    
    if (filterDescs.length > 0) {
        embed.setDescription(filterDescs.join(' | '));
    }

    for (const task of pageTasks) {
        const statusIcon = task.status === 'COMPLETED' ? '\u2705' : task.status === 'PENDING' ? '\ud83d\uddd2\ufe0f' : task.status === 'LATE' ? '\u274c' : '\u2139\ufe0f';
        const taskTitle = `${statusIcon} ${task.taskName || task.taskType}`;
        const username = task.userId?.username || 'Unknown';
        const assignedDate = new Date(task.assignedAt).toLocaleString();
        const deadlineTs = Math.round(new Date(task.deadline).getTime() / 1000);
        const extStatus = task.hasExtended ? ' [Extended]' : '';
        
        let fieldValue = `**User:** ${username}\n**Role:** ${task.roleName}\n**Type:** ${task.taskType}\n**Status:** ${task.status}${extStatus}\n**Assigned:** ${assignedDate}\n**Deadline:** <t:${deadlineTs}:F>`;
        
        if (task.description) {
            fieldValue += `\n**Description:** ${task.description}`;
        }
        
        embed.addFields({ name: taskTitle, value: fieldValue, inline: false });
    }

    return { embeds: [embed], page: currentPage, totalPages: totalPages, filters: filters };
};

const coreHelp = async () => {
    const embed = new EmbedBuilder()
        .setTitle('🎤 Miku\'s Command Guide ♪')
        .setColor(0x39c5bb)
        .setDescription('Yahallo~! ✨ I\'m here to help make our SEKAI amazing! Here are all the ways we can work together~ Let\'s create something wonderful! ♪\n\n🎵 Use `/` for slash commands or `!` for prefix commands')
        .setTimestamp();

    embed.addFields({
        name: '✨ Task Management',
        value: '`/assign` - Assign tasks (supports Custom tasks with duration_days & extension_days!)\n`/submit` - Submit your amazing work! (needs approval~)\n`/extension` - Need more time? Request with a reason (requires approval)\n`/tasks` - See all your current assignments\n`/checkfree` - See who is available or check a specific user! ♪',
        inline: false
    });

    embed.addFields({
        name: '🌟 User Management',
        value: '`/onboard` - Welcome new crew members!\n`/profile` - Check your stats and achievements~\n`/card` - View your ID card (like the website card!) or `/card @user` for someone else\n`/strike add/remove` - Manage strikes (add requires reason)\n`/hiatus` - Request a break with reason (needs approval)\n`/endhiatus` - Come back from hiatus (leave blank for yourself!)',
        inline: false
    });

    embed.addFields({
        name: '📚 History & Tracking',
        value: '`/history` - View complete task history with filters\n🔍 Filters: user, task name, status (PENDING/COMPLETED/LATE), role',
        inline: false
    });

    embed.addFields({
        name: '🔔 Special Features',
        value: '• **Custom Tasks**: Use `task:Custom` with `duration_days` & optional `extension_days`\n• **Smart Reminders**: Get notified before deadlines!\n• **Hiatus System**: Tasks pause during hiatus, fresh deadlines on return\n• **Approval System**: Submissions, extensions, and hiatus need staff approval',
        inline: false
    });

    embed.addFields({
        name: '💡 Tips for Success~',
        value: '• Always specify which task when submitting if you have multiple!\n• Extensions can only be used once per task\n• Tasks on hiatus show "N/A" for deadline\n• Reminders are sent at configured intervals\n• Completing tasks removes a strike - keep up the good work! ♪',
        inline: false
    });

    return { embeds: [embed] };
};

const coreHiatus = async (guild, author, targetUser, reason, channelId = null, isDirect = false) => {
    if (!reason) {
        return { content: '⚠️ Please provide a reason for the hiatus request.' };
    }

    if (isDirect) {
        await UserUtils.setHiatus(targetUser.id, true);
        
        const Assignment = (await import('../../DB/Schemas/assignment.js')).default;
        const pendingTasks = await Assignment.find({
            discordUserId: targetUser.id,
            status: 'PENDING'
        });
        
        for (const task of pendingTasks) {
            task.deadline = new Date('2099-12-31');
            task.firstReminderSent = true;
            task.finalReminderSent = true;
            await task.save();
        }
        
        await logAction(guild, `🏖️ Hiatus granted directly to <@${targetUser.id}> by <@${author.id}>. All ${pendingTasks.length} pending task(s) paused.`, author);
        
        if (channelId) {
            const channel = guild.channels.cache.get(channelId);
            if (channel) {
                channel.send(`🌸 <@${targetUser.id}> You've been granted hiatus! All your tasks are paused. Take the time you need and come back when you're ready~ ♪`);
            }
        }
        
        return { content: `✅ Hiatus granted to <@${targetUser.id}>! All ${pendingTasks.length} pending task(s) have been paused.` };
    }

    const embed = new EmbedBuilder()
        .setTitle('🏖️ Hiatus Request ♪')
        .setColor(0x39c5bb)
        .setDescription(`<@${targetUser.id}> needs to take a little break. Taking care of yourself is important! 💖`)
        .addFields(
            { name: 'User', value: `<@${targetUser.id}>`, inline: true },
            { name: 'Username', value: targetUser.tag, inline: true },
            { name: 'Reason', value: reason, inline: false }
        )
        .setFooter({ text: channelId ? `Channel: ${channelId}` : null })
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`hiatus_approve_${targetUser.id}`)
                .setLabel('Approve')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`hiatus_deny_${targetUser.id}`)
                .setLabel('Deny')
                .setStyle(ButtonStyle.Danger)
        );

    const approvalChannel = guild.channels.cache.get(config.APPROVAL_CHANNEL_ID);
    if (approvalChannel) {
        await approvalChannel.send({ embeds: [embed], components: [row] });
    }

    return { content: `✅ Your hiatus request has been sent for review! I hope everything is okay~ ♪` };
};

const coreHiatusEnd = async (guild, author, targetUser) => {
    const user = await UserUtils.setHiatus(targetUser.id, false);
    
    if (!user) return { content: '❌ User not found.' };

    const Assignment = (await import('../../DB/Schemas/assignment.js')).default;
    const pendingTasks = await Assignment.find({
        discordUserId: targetUser.id,
        status: 'PENDING'
    });
    
    for (const task of pendingTasks) {
        const rule = config.RULES[task.roleCategoryId];
        if (rule && rule.tasks[task.taskType]) {
            const newDeadline = new Date(Date.now() + rule.tasks[task.taskType]);
            task.deadline = newDeadline;
            task.hasExtended = false;
            task.firstReminderSent = false;
            task.finalReminderSent = false;
            await task.save();
        }
    }
    
    if (pendingTasks.length > 0) {
        await logAction(guild, `🌸 Welcome back! Ended hiatus for <@${targetUser.id}> - Set new deadlines for ${pendingTasks.length} task(s)`, author);
        return { content: `✅ Hiatus ended for <@${targetUser.id}>.\n⏰ Set new deadlines for ${pendingTasks.length} task(s) based on their task types. Welcome back! ♪` };
    }

    await logAction(guild, `🌸 Welcome back! Ended hiatus for <@${targetUser.id}>`, author);
    return { content: `✅ Hiatus ended for <@${targetUser.id}>.` };
};

export const handleAssignSlash = async (interaction) => {
    await interaction.deferReply();
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOwner(member)) {
        return interaction.editReply({ content: 'Sorry, but only owners can assign tasks! If you need something assigned, reach out to them~ ♪' });
    }
    const roleName = interaction.options.getString('role');
    const taskName = interaction.options.getString('name') || '';
    const description = interaction.options.getString('description') || '';
    const durationDays = interaction.options.getInteger('duration_days');
    const extensionDays = interaction.options.getInteger('extension_days');
    const result = await coreAssign(interaction.guild, interaction.user, interaction.options.getUser('user'), interaction.options.getString('task'), roleName, taskName, description, durationDays, extensionDays);
    return interaction.editReply(result);
};

export const handleSubmitSlash = async (interaction) => {
    await interaction.deferReply();
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const user = interaction.options.getUser('user') || interaction.user;
    
    if (user.id !== interaction.user.id && !isOwner(member)) {
        return interaction.editReply({ content: 'I appreciate the help, but you can only submit your own tasks! ♪' });
    }
    
    if (!(await isOnboarded(user.id))) {
        return interaction.editReply({ content: 'Looks like this user needs to be onboarded first! Ask an owner to help~ ♪' });
    }
    
    const taskName = interaction.options.getString('task') || '';
    const result = await coreSubmit(interaction.guild, interaction.user, user, taskName, interaction.channelId);
    return interaction.editReply(result);
};

export const handleExtensionSlash = async (interaction) => {
    await interaction.deferReply();
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const user = interaction.options.getUser('user') || interaction.user;
    
    if (user.id !== interaction.user.id && !isOwner(member)) {
        console.log("Is Owner:" ,isOwner(member));
        return interaction.editReply({ content: 'You can only request extensions for your own tasks! If someone else needs help, they should ask directly~ ♪' });
    }
    
    if (!(await isOnboarded(user.id))) {
        return interaction.editReply({ content: 'Looks like this user needs to be onboarded first! Ask an owner to help~ ♪' });
    }
    
    const taskName = interaction.options.getString('task') || '';
    const reason = interaction.options.getString('reason') || '';
    const result = await coreExtension(interaction.guild, interaction.user, user, taskName, reason, interaction.channelId);
    return interaction.editReply(result);
};

export const handleProfileSlash = async (interaction) => {
    await interaction.deferReply();
    const user = interaction.options.getUser('user') || interaction.user;
    const result = await coreProfile(user, interaction.guild);
    return interaction.editReply(result);
};

export const handleCardSlash = async (interaction) => {
    await interaction.deferReply();
    const user = interaction.options.getUser('user') || interaction.user;
    const result = await coreCard(user, interaction.guild);
    return interaction.editReply(result);
};

export const handleStrikeSlash = async (interaction) => {
    await interaction.deferReply();
    const member = await interaction.guild.members.fetch(interaction.user.id);
    
    if (!isManagerOrOwner(member)) {
        return interaction.editReply({ content: 'Strike management is handled by managers and owners! If there\'s an issue, please reach out to them~ ♪' });
    }

    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'list') {
        const result = await coreStrikeList(interaction.guild, interaction.user);
        return interaction.editReply(result);
    }

    const result = await coreStrike(interaction.guild, interaction.user, interaction.options.getUser('user'), subcommand, interaction.options.getString('reason'));
    return interaction.editReply(result);
};

export const handleOnboardSlash = async (interaction) => {
    await interaction.deferReply();
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOwner(member)) {
        return interaction.editReply({ content: 'Only owners can onboard new users! If someone needs to join, ask an owner to help them get started~ ♪' });
    }
    const result = await coreOnboard(interaction.guild, interaction.user, interaction.options.getUser('user'));
    return interaction.editReply(result);
};

export const handleDeboardSlash = async (interaction) => {
    await interaction.deferReply();
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOwner(member)) {
        return interaction.editReply({ content: 'Only owners can deboard users. If someone needs to take a break, ask an owner to help~ ♪' });
    }
    const targetUser = interaction.options.getUser('user');
    const customMessage = interaction.options.getString('message');
    const result = await coreDeboard(interaction.guild, interaction.user, targetUser, customMessage);
    return interaction.editReply(result);
};

export const handleRemoveTaskSlash = async (interaction) => {
    await interaction.deferReply();
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isManagerOrOwner(member)) {
        return interaction.editReply({ content: 'Only managers and owners can remove tasks! If a task needs to be removed, ask an owner or manager~ ♪' });
    }
    const targetUser = interaction.options.getUser('user');
    const taskIdentifier = interaction.options.getString('task');
    const result = await coreRemoveTask(interaction.guild, interaction.user, targetUser, taskIdentifier);
    return interaction.editReply(result);
};

export const handleHiatusSlash = async (interaction) => {
    await interaction.deferReply();
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const reason = interaction.options.getString('reason');
    const targetUser = interaction.options.getUser('user');

    if (targetUser) {
        if (!isOwner(member)) {
            return interaction.editReply({ content: 'Only owners can grant hiatus directly to other users! Normal users can request their own hiatus~ ♪' });
        }
        
        if (!(await isOnboarded(targetUser.id))) {
            return interaction.editReply({ content: 'Looks like this user needs to be onboarded first! Ask an owner to help~ ♪' });
        }
        
        const result = await coreHiatus(interaction.guild, interaction.user, targetUser, reason, interaction.channelId, true);
        return interaction.editReply(result);
    }
    
    if (!(await isOnboarded(interaction.user.id))) {
        return interaction.editReply({ content: 'You need to be onboarded before requesting a hiatus! Talk to an owner to get started~ ♪' });
    }
    
    const result = await coreHiatus(interaction.guild, interaction.user, interaction.user, reason, interaction.channelId, false);
    return interaction.editReply(result);
};

export const handleEndHiatusSlash = async (interaction) => {
    await interaction.deferReply();
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const targetUser = interaction.options.getUser('user') || interaction.user;
    
    if (targetUser.id !== interaction.user.id && !isOwner(member)) {
        return interaction.editReply({ content: 'You can only end your own hiatus! If someone else is ready to return, they should let us know themselves~ ♪' });
    }
    
    if (!(await isOnboarded(targetUser.id))) {
        return interaction.editReply({ content: 'Looks like this user needs to be onboarded first! Ask an owner to help~ ♪' });
    }
    
    const result = await coreHiatusEnd(interaction.guild, interaction.user, targetUser);
    return interaction.editReply(result);
};

export const handleTasksSlash = async (interaction) => {
    await interaction.deferReply();
    const user = interaction.options.getUser('user') || interaction.user;
    const result = await coreTasks(user);
    return interaction.editReply(result);
};

export const handleHistorySlash = async (interaction) => {
    await interaction.deferReply();
    const user = interaction.options.getUser('user') || null;
    const taskName = interaction.options.getString('task') || null;
    const status = interaction.options.getString('status') || null;
    const roleName = interaction.options.getString('role') || null;
    
    const filters = {
        targetUser: user,
        discordUserId: user ? user.id : null,
        taskName: taskName,
        status: status,
        roleName: roleName
    };
    
    const result = await coreHistory(filters, 0);
    
    if (result.totalPages > 1) {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('history_prev')
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('history_next')
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary)
            );
        
        const response = await interaction.editReply({ embeds: result.embeds, components: [row], fetchReply: true });
        
        const collector = response.createMessageComponentCollector({ time: 300000 });
        let currentPage = 0;
        
        collector.on('collect', async i => {
            await i.deferUpdate();
            if (i.customId === 'history_prev') currentPage = Math.max(0, currentPage - 1);
            if (i.customId === 'history_next') currentPage = Math.min(result.totalPages - 1, currentPage + 1);
            
            const newResult = await coreHistory(filters, currentPage);
            
            const newRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('history_prev')
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentPage === 0),
                    new ButtonBuilder()
                        .setCustomId('history_next')
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentPage === result.totalPages - 1)
                );
            
            await i.editReply({ embeds: newResult.embeds, components: [newRow] });
        });
        
        collector.on('end', () => {
            const disabledRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('history_prev')
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('history_next')
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true)
                );
            response.edit({ components: [disabledRow] }).catch(() => {});
        });
    } else {
        return interaction.editReply(result);
    }
};

const coreCheckFree = async (_guild, targetUser = null) => {
    try {
        if (targetUser) {
            const userStatus = await TaskUtils.checkUserAvailability(targetUser.id);
            
            if (!userStatus) {
                return { content: `I couldn't find any profile for <@${targetUser.id}>. Maybe they haven't joined the team yet?` };
            }
            
            const embed = new EmbedBuilder()
                .setTitle(`🎵 Availability Check: ${targetUser.username}`)
                .setColor(userStatus.isFree ? 0x39c5bb : 0xff5555) 
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setTimestamp();
            
            const statusEmoji = userStatus.isFree ? '✨' : '🔥';
            const statusText = userStatus.isFree ? "**FREE**" : "**BUSY**";
            
            let description = `${statusEmoji} Current Status: ${statusText}`;
            if (userStatus.isOnHiatus) description += ` (On Hiatus 🏝️)`;
            
            embed.setDescription(description);
            
            if (!userStatus.isFree && userStatus.activeTask) {
                embed.addFields({
                    name: 'Current Task',
                    value: `**${userStatus.activeTask.taskName || userStatus.activeTask.taskType}**\nRole: ${userStatus.activeTask.roleName}\nDeadline: <t:${Math.floor(new Date(userStatus.activeTask.deadline).getTime() / 1000)}:R>`,
                    inline: false
                });
            } else if (userStatus.isFree) {
                embed.addFields({
                    name: 'Ready for work?',
                    value: userStatus.isOnHiatus ? "Checking in on hiatus! Take your time~" : "Ready to take on a new challenge! ♪",
                    inline: false
                });
            }
            
            if (userStatus.lastTask) {
                embed.addFields({
                    name: 'Last Completed Task',
                    value: `**${userStatus.lastTask.taskName || userStatus.lastTask.taskType}**\nCompleted: <t:${Math.floor(new Date(userStatus.lastTask.deadline).getTime() / 1000)}:d>`, // Using deadline as proxy for completion time if completedAt isn't tracked, or we can assume it was recent. schema doesn't have completedAt, using deadline or maybe assignedAt? Schema has status only. Wait, completeAssignment updates status. Let's use deadline as approximation or nothing. 
                    inline: false
                });
            } else {
                embed.addFields({ name: 'History', value: "No completed tasks yet. A fresh start!", inline: false });
            }
            
            embed.setFooter({ text: userStatus.isFree ? "Let's assign something fun! 💫" : "Gambare! You can do it! ♪" });
            return { embeds: [embed] };
            
        } else {
            // List all free users
            const freeUsers = await TaskUtils.fetchFreeUsersWithStatus();
            
            if (!freeUsers || freeUsers.length === 0) {
                return { content: "Everyone seems to be busy with their tasks right now! Just like hard-working idols! ♪" };
            }

            const embed = new EmbedBuilder()
                .setTitle('🎵 Available Users')
                .setColor(0x39c5bb)
                .setDescription("Here are the users with no active tasks~ Time to make some music! 🎤")
                .setTimestamp();
            
            
            // Function to chunk array into smaller pieces
            const chunkArray = (arr, size) => {
                const chunks = [];
                for (let i = 0; i < arr.length; i += size) {
                    chunks.push(arr.slice(i, i + size));
                }
                return chunks;
            };

            const activeFree = freeUsers.filter(u => !u.isOnHiatus);
            const hiatusFree = freeUsers.filter(u => u.isOnHiatus);
            
            if (activeFree.length > 0) {
                const activeList = activeFree.map(u => {
                    const lastTaskInfo = u.lastTask 
                        ? `Last: *${u.lastTask.taskName || u.lastTask.taskType}*`
                        : "No prior tasks";
                    return `• <@${u.discordId}> - ${lastTaskInfo}`;
                });
                
                // Embed field value limit is 1024 characters.
                // We'll create multiple fields if the list is too long.
                const chunks = [];
                let currentChunk = "";
                
                for (const line of activeList) {
                    if ((currentChunk + line + "\n").length > 1024) {
                        chunks.push(currentChunk);
                        currentChunk = line + "\n";
                    } else {
                        currentChunk += line + "\n";
                    }
                }
                if (currentChunk) chunks.push(currentChunk);

                chunks.forEach((chunk, index) => {
                    embed.addFields({ 
                        name: index === 0 ? '✨ Ready for Assignment' : '✨ Ready for Assignment (Cont.)', 
                        value: chunk, 
                        inline: false 
                    });
                });
            }
            
            if (hiatusFree.length > 0) {
                const hiatusList = hiatusFree.map(u => {
                    const lastTaskInfo = u.lastTask 
                        ? `Last: *${u.lastTask.taskName || u.lastTask.taskType}*`
                        : "No prior tasks";
                    return `• <@${u.discordId}> - ${lastTaskInfo}`;
                });

                const chunks = [];
                let currentChunk = "";
                
                for (const line of hiatusList) {
                    if ((currentChunk + line + "\n").length > 1024) {
                        chunks.push(currentChunk);
                        currentChunk = line + "\n";
                    } else {
                        currentChunk += line + "\n";
                    }
                }
                if (currentChunk) chunks.push(currentChunk);

                chunks.forEach((chunk, index) => {
                    embed.addFields({ 
                        name: index === 0 ? '🏝️ On Hiatus (Free)' : '🏝️ On Hiatus (Free) (Cont.)', 
                        value: chunk, 
                        inline: false 
                    });
                });
            }
            
            if (activeFree.length === 0 && hiatusFree.length === 0) {
                 embed.setDescription("Everyone is busy! Ganbatte~!");
            }

            embed.setFooter({ text: "Let's create something amazing together! 💫" });

            return { embeds: [embed] };
        }
    } catch (error) {
        console.error("Error in coreCheckFree:", error);
        return { content: "O-Oh no! Something went wrong while checking for available users... 😢" };
    }
};

const corePing = async (interaction) => {
    const sent = await interaction.editReply('Checking connection... ♪');
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    
    const embed = new EmbedBuilder()
        .setTitle('🎤 Connection Check!')
        .setColor(0x39c5bb)
        .setDescription(`Looks like I'm responding just fine! Everything's working smoothly~`)
        .addFields(
            { name: 'Response Time', value: `${latency}ms`, inline: true },
            { name: 'Status', value: latency < 200 ? '✨ Excellent!' : latency < 400 ? '👍 Good!' : '⚠️ A bit slow...', inline: true }
        )
        .setFooter({ text: 'Ready to help anytime!' })
        .setTimestamp();
    
    return { embeds: [embed] };
};

const coreUptime = (client) => {
    const totalSeconds = Math.floor(client.uptime / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const h = Math.floor(totalSeconds / 3600) % 24;
    const m = Math.floor(totalSeconds / 60) % 60;
    
    const embed = new EmbedBuilder()
        .setTitle('🎵 How Long Have I Been Here?')
        .setColor(0x39c5bb)
        .setDescription(`I've been working hard for this SEKAI! Let's keep the momentum going~`)
        .addFields(
            { name: 'Time Online', value: `**${days}** days, **${h}** hours, **${m}** minutes`, inline: false },
            { name: 'Status', value: '💚 Running strong!', inline: false }
        )
        .setFooter({ text: 'Always here to support everyone\'s creative journey!' })
        .setTimestamp();
    
    return { embeds: [embed] };
};

export const handleCheckFreeSlash = async (interaction) => {
    await interaction.deferReply();
    const targetUser = interaction.options.getUser('user');
    const result = await coreCheckFree(interaction.guild, targetUser);
    return interaction.editReply(result);
};

export const handlePingSlash = async (interaction) => {
    await interaction.deferReply();
    const result = await corePing(interaction);
    return interaction.editReply(result);
};

export const handleUptimeSlash = async (interaction) => {
    await interaction.deferReply();
    const result = coreUptime(interaction.client);
    return interaction.editReply(result);
};

export const handleHelpSlash = async (interaction) => {
    await interaction.deferReply();
    const result = await coreHelp();
    return interaction.editReply(result);
};

export const handlePrefixCommand = async (message) => {
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const author = message.author;
    const guild = message.guild;

    if (command === 'assign') {
        const target = resolveTarget(message);
        const taskType = args[1];
        const roleName = args[2];
        if (!target || !taskType || !roleName) return message.reply("Usage: `!assign @User <task_type> <role_name> [name] [description]`");
        const taskName = args[3] || '';
        const description = args.slice(4).join(' ') || '';
        const res = await coreAssign(guild, author, target, taskType, roleName, taskName, description);
        return message.reply(res);
    }

    if (command === 'submit') {
        const target = resolveTarget(message) || author;
        const taskName = args[1] ? args.slice(1).join(' ') : '';
        const res = await coreSubmit(guild, author, target, taskName);
        return message.reply(res);
    }

    if (command === 'extension') {
        const target = resolveTarget(message) || author;
        const remainingArgs = args.slice(target !== author ? 1 : 0);
        
        if (remainingArgs.length < 2) {
            return message.reply("Usage: `!extension [@User] <task_name> <reason>`");
        }
        
        const taskName = remainingArgs[0];
        const reason = remainingArgs.slice(1).join(' ');
        const res = await coreExtension(guild, author, target, taskName, reason);
        return message.reply(res);
    }

    if (command === 'profile') {
        const target = resolveTarget(message) || author;
        const res = await coreProfile(target, guild);
        return message.reply(res);
    }

    if (command === 'card') {
        const target = resolveTarget(message) || author;
        const res = await coreCard(target, guild);
        return message.reply(res);
    }

    if (command === 'strike') {
        const action = args[0];
        
        if (action === 'list') {
             const res = await coreStrikeList(guild, author);
             return message.reply(res);
        }

        const target = resolveTarget(message);
        
        if (!target || !['add', 'remove'].includes(action)) return message.reply("Usage: `!strike add @User <reason>` or `!strike remove @User` or `!strike list`");
        
        const reason = args.slice(2).join(' ');
        
        if (action === 'add' && (!reason || reason.trim().length === 0)) {
            return message.reply("⚠️ Please provide a reason for adding a strike.");
        }
        
        const res = await coreStrike(guild, author, target, action, reason || "N/A");
        return message.reply(res);
    }

    if (command === 'onboard') {
        const member = await guild.members.fetch(author.id).catch(() => null);
        if (!member || !isOwner(member)) {
            return message.reply("Only owners can onboard new users! If someone needs to join, ask an owner to help them get started~ ♪");
        }
        const target = resolveTarget(message);
        if (!target) return message.reply("Usage: `!onboard @User`");
        const res = await coreOnboard(guild, author, target);
        return message.reply(res);
    }

    if (command === 'deboard') {
        const member = await guild.members.fetch(author.id).catch(() => null);
        if (!member || !isOwner(member)) {
            return message.reply("Only owners can deboard users. If someone needs to take a break, ask an owner to help~ ♪");
        }
        const target = resolveTarget(message);
        if (!target) return message.reply("Usage: `!deboard @User [custom message]`");
        const customMessage = args.length > 1 ? args.slice(1).join(' ') : null;
        const res = await coreDeboard(guild, author, target, customMessage);
        return message.reply(res);
    }

    if (command === 'removetask') {
        const member = await guild.members.fetch(author.id).catch(() => null);
        if (!member || !isManagerOrOwner(member)) {
            return message.reply("Only managers and owners can remove tasks! If a task needs to be removed, ask an owner or manager~ ♪");
        }
        const target = resolveTarget(message);
        if (!target) return message.reply("Usage: `!removetask @User <task_name_or_type>`");
        const taskIdentifier = args.length > 1 ? args.slice(1).join(' ') : '';
        if (!taskIdentifier) return message.reply("Usage: `!removetask @User <task_name_or_type>`");
        const res = await coreRemoveTask(guild, author, target, taskIdentifier);
        return message.reply(res);
    }

    if (command === 'hiatus') {
        const reason = args.join(' ');
        if (!reason) return message.reply("Usage: `!hiatus <reason>`");
        
        const res = await coreHiatus(guild, author, reason);
        return message.reply(res);
    }

    if (command === 'endhiatus') {
        const target = resolveTarget(message);
        if (!target) return message.reply("Usage: `!endhiatus @User`");
        
        const res = await coreHiatusEnd(guild, author, target);
        return message.reply(res);
    }
    if (command === 'tasks') {
        const target = resolveTarget(message) || author;
        const res = await coreTasks(target);
        return message.reply(res);
    }

    if (command === 'history') {
        const target = resolveTarget(message) || null;
        const remainingArgs = args.slice(target ? 1 : 0);
        
        const filters = {
            targetUser: target,
            discordUserId: target ? target.id : null,
            taskName: remainingArgs.length > 0 ? remainingArgs.join(' ') : null
        };
        
        const res = await coreHistory(filters, 0);
        
        if (res.totalPages > 1) {
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('history_prev_prefix')
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('history_next_prefix')
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                );
            
            const response = await message.reply({ embeds: res.embeds, components: [row] });
            
            const collector = response.createMessageComponentCollector({ time: 300000 });
            let currentPage = 0;
            
            collector.on('collect', async i => {
                await i.deferUpdate();
                if (i.customId === 'history_prev_prefix') currentPage = Math.max(0, currentPage - 1);
                if (i.customId === 'history_next_prefix') currentPage = Math.min(res.totalPages - 1, currentPage + 1);
                
                const newResult = await coreHistory(filters, currentPage);
                
                const newRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('history_prev_prefix')
                            .setLabel('Previous')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(currentPage === 0),
                        new ButtonBuilder()
                            .setCustomId('history_next_prefix')
                            .setLabel('Next')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(currentPage === res.totalPages - 1)
                    );
                
                await i.editReply({ embeds: newResult.embeds, components: [newRow] });
            });
            
            collector.on('end', () => {
                const disabledRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('history_prev_prefix')
                            .setLabel('Previous')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('history_next_prefix')
                            .setLabel('Next')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true)
                    );
                response.edit({ components: [disabledRow] }).catch(() => {});
            });
        } else {
            return message.reply(res);
        }
    }

    if (command === 'ping') {
        const sent = await message.reply('Pinging...');
        const latency = sent.createdTimestamp - message.createdTimestamp;
        sent.edit(`🏓 **Pong!** Latency: \`${latency}ms\``);
        await logAction(guild, `Checked Ping`, author);
    }

    if (command === 'uptime') {
        const totalSeconds = (message.client.uptime / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const h = Math.floor(totalSeconds / 3600) % 24;
        const m = Math.floor(totalSeconds / 60) % 60;
        message.reply(`⏳ **System Uptime:** ${days}d ${h}h ${m}m`);
        await logAction(guild, `Checked Uptime`, author);
    }

    if (command === 'checkfree' || command === 'available') {
        const target = resolveTarget(message);
        const res = await coreCheckFree(guild, target);
        return message.reply(res);
    }

    if (command === 'help') {
        const res = await coreHelp();
        return message.reply(res);
    }
};