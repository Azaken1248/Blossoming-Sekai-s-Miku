import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import config from '../../config.js';
import * as UserUtils from '../DBUtils/userUtils.js';
import * as TaskUtils from '../DBUtils/taskUtils.js';

// Permission checking helpers
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

    const pendingTasks = profile.assignments.filter(a => a.status === 'PENDING');
    if (pendingTasks.length === 0) {
        return { content: "⚠️ No pending assignments found for this user." };
    }

    if (!taskName) {
        const taskList = pendingTasks.map(t => `• **${t.taskName || t.taskType}** (${t.roleName})`).join('\n');
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

    const embed = new EmbedBuilder()
        .setTitle('✨ Submission Ready for Review! ♪')
        .setColor(0x39c5bb)
        .setDescription(`Yay! <@${targetUser.id}> has finished their task and it\'s ready to shine! Let\'s take a look at this amazing work~ 🎉`)
        .addFields(
            { name: 'Task', value: task.taskName || task.taskType, inline: true },
            { name: 'Role', value: task.roleName, inline: true },
            { name: 'Type', value: task.taskType, inline: true }
        )
        .setTimestamp();

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

    if (task.hasExtended) {
        return { content: "⚠️ This task has already been extended once." };
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
    // Easter egg: if someone asks about Miku herself!
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
        
        return { embeds: [embed] };
    }
    
    const profile = await UserUtils.getUserProfile(targetUser.id);
    if (!profile) return { content: "User not found." };

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

const coreStrike = async (guild, author, targetUser, action, reason) => {
    // Ensure user exists
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

const coreOnboard = async (guild, author, targetUser) => {
    const user = await UserUtils.findOrCreateUser(targetUser.id, targetUser.username);
    await logAction(guild, `🎉 Welcomed <@${targetUser.id}> to our SEKAI!`, author);
    return { content: `🎉 Welcome to our SEKAI, <@${targetUser.id}>! I'm so excited to create amazing things with you~ ♪\nStrikes: **${user.strikes}/3**` };
};

const coreTasks = async (targetUser) => {
    const profile = await UserUtils.getUserProfile(targetUser.id);
    if (!profile) return { content: "User not found." };

    if (!profile.assignments || profile.assignments.length === 0) {
        return { content: `<@${targetUser.id}> has no tasks.` };
    }

    const activeTasks = profile.assignments.filter(a => a.status === 'PENDING');
    
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
        const taskTitle = task.taskName || task.taskType;
        
        const deadlineText = profile.isOnHiatus ? 'N/A (On Hiatus)' : `<t:${ts}:F> (<t:${ts}:R>)`;
        let fieldValue = `**Type:** ${task.taskType}\n**Role:** ${task.roleName || 'N/A'}\n**Deadline:** ${deadlineText}${extStatus}`;
        
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
        value: '`/assign` - Assign tasks (supports Custom tasks with duration_days & extension_days!)\n`/submit` - Submit your amazing work! (needs approval~)\n`/extension` - Need more time? Request with a reason (requires approval)\n`/tasks` - See all your current assignments',
        inline: false
    });

    embed.addFields({
        name: '🌟 User Management',
        value: '`/onboard` - Welcome new crew members!\n`/profile` - Check your stats and achievements~\n`/strike add/remove` - Manage strikes (add requires reason)\n`/hiatus` - Request a break with reason (needs approval)\n`/endhiatus` - Come back from hiatus (leave blank for yourself!)',
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

const coreHiatus = async (guild, author, reason, channelId = null) => {
    if (!reason) {
        return { content: '⚠️ Please provide a reason for the hiatus request.' };
    }

    const embed = new EmbedBuilder()
        .setTitle('🏖️ Hiatus Request ♪')
        .setColor(0x39c5bb)
        .setDescription(`<@${author.id}> needs to take a little break. Taking care of yourself is important! 💖`)
        .addFields(
            { name: 'User', value: `<@${author.id}>`, inline: true },
            { name: 'Username', value: author.tag, inline: true },
            { name: 'Reason', value: reason, inline: false }
        )
        .setFooter({ text: channelId ? `Channel: ${channelId}` : null })
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`hiatus_approve_${author.id}`)
                .setLabel('Approve')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`hiatus_deny_${author.id}`)
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
    
    // Only owners can submit for others
    if (user.id !== interaction.user.id && !isOwner(member)) {
        return interaction.editReply({ content: 'I appreciate the help, but you can only submit your own tasks! ♪' });
    }
    
    // Must be onboarded
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
    
    // Only owners can request extensions for others
    if (user.id !== interaction.user.id && !isOwner(member)) {
        return interaction.editReply({ content: 'You can only request extensions for your own tasks! If someone else needs help, they should ask directly~ ♪' });
    }
    
    // Must be onboarded
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

export const handleStrikeSlash = async (interaction) => {
    await interaction.deferReply();
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isManagerOrOwner(member)) {
        return interaction.editReply({ content: 'Strike management is handled by managers and owners! If there\'s an issue, please reach out to them~ ♪' });
    }
    const result = await coreStrike(interaction.guild, interaction.user, interaction.options.getUser('user'), interaction.options.getSubcommand(), interaction.options.getString('reason'));
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

export const handleHiatusSlash = async (interaction) => {
    await interaction.deferReply();
    // Must be onboarded to request hiatus
    if (!(await isOnboarded(interaction.user.id))) {
        return interaction.editReply({ content: 'You need to be onboarded before requesting a hiatus! Talk to an owner to get started~ ♪' });
    }
    const reason = interaction.options.getString('reason');
    const result = await coreHiatus(interaction.guild, interaction.user, reason, interaction.channelId);
    return interaction.editReply(result);
};

export const handleEndHiatusSlash = async (interaction) => {
    await interaction.deferReply();
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const targetUser = interaction.options.getUser('user') || interaction.user;
    
    // Only owners can end hiatus for others; onboarded users can end their own
    if (targetUser.id !== interaction.user.id && !isOwner(member)) {
        return interaction.editReply({ content: 'You can only end your own hiatus! If someone else is ready to return, they should let us know themselves~ ♪' });
    }
    
    // Must be onboarded
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
        return interaction.reply(result);
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

    if (command === 'strike') {
        const action = args[0];
        const target = resolveTarget(message);
        
        if (!target || !['add', 'remove'].includes(action)) return message.reply("Usage: `!strike add @User <reason>` or `!strike remove @User`");
        
        const reason = args.slice(2).join(' ');
        
        if (action === 'add' && (!reason || reason.trim().length === 0)) {
            return message.reply("⚠️ Please provide a reason for adding a strike.");
        }
        
        const res = await coreStrike(guild, author, target, action, reason || "N/A");
        return message.reply(res);
    }

    if (command === 'onboard') {
        const target = resolveTarget(message);
        if (!target) return message.reply("Usage: `!onboard @User`");
        const res = await coreOnboard(guild, author, target);
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

    if (command === 'help') {
        const res = await coreHelp();
        return message.reply(res);
    }
};