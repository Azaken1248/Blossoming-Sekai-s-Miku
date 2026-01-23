import dotenv from 'dotenv';
import { Client, GatewayIntentBits, Partials, SlashCommandBuilder, REST, Routes } from 'discord.js';
import connectDB from './DB/db.js';
import config from './config.js';

import * as Commands from './Utils/DiscordUtils/commands.js';
import * as TaskUtils from './Utils/DBUtils/taskUtils.js';
import * as UserUtils from './Utils/DBUtils/userUtils.js';

dotenv.config();

console.log('[STARTUP] Connecting to MongoDB...');
connectDB().then(() => {
    console.log('[STARTUP] ✅ MongoDB connected\n');
}).catch(err => {
    console.error('[STARTUP] ❌ MongoDB connection failed:', err);
    process.exit(1);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent 
    ],
    partials: [Partials.GuildMember]
});

async function runScheduler(isStartup = false) {
    const timestamp = new Date().toISOString();
    console.log('\n========================================');
    console.log(`[SCHEDULER] Running at ${timestamp}`);
    if (isStartup) {
        console.log('[SCHEDULER] 🚀 STARTUP CHECK - Catching up on missed reminders...');
    }
    console.log('========================================\n');
    
    const guild = client.guilds.cache.first();
    if (!guild) {
        console.log('[SCHEDULER] ⚠️ No guild found. Skipping scheduler run.');
        return;
    }
    
    console.log('[REMINDERS] 📋 Fetching all pending tasks for analysis...');
    const Assignment = (await import('./DB/Schemas/assignment.js')).default;
    const allPendingTasks = await Assignment.find({ status: 'PENDING' });
    console.log(`[REMINDERS] Total pending tasks in DB: ${allPendingTasks.length}`);
    
    if (allPendingTasks.length > 0) {
        const now = Date.now();
        console.log('[REMINDERS] Task analysis:');
        for (const t of allPendingTasks) {
            const timeLeft = t.deadline.getTime() - now;
            const duration = t.deadline.getTime() - t.assignedAt.getTime();
            console.log(`[REMINDERS]   - "${t.taskName || t.taskType}" | User: ${t.discordUserId}`);
            console.log(`[REMINDERS]     Time until deadline: ${Math.round(timeLeft / 1000)}s (${Math.round(timeLeft / 60000)}m)`);
            console.log(`[REMINDERS]     Task duration: ${Math.round(duration / 1000)}s (${Math.round(duration / (24*60*60*1000))}d)`);
            console.log(`[REMINDERS]     First reminder sent: ${t.firstReminderSent}, Final: ${t.finalReminderSent}`);
        }
    }
    console.log();
    
    console.log('[REMINDERS] 📋 Fetching tasks that need reminders...');
    const tasksNeedingReminders = await TaskUtils.fetchTasksNeedingReminders(config);
    console.log(`[REMINDERS] Found ${tasksNeedingReminders.length} task(s) needing reminders\n`);
    
    let remindersSent = 0;
    let remindersSkipped = 0;
    
    for (const { task, reminderType } of tasksNeedingReminders) {
        console.log(`[REMINDER-CHECK] Task: "${task.taskName || task.taskType}" | User: ${task.discordUserId}`);
        console.log(`[REMINDER-CHECK]   Role: ${task.roleName} | Type: ${reminderType.toUpperCase()}`);
        console.log(`[REMINDER-CHECK]   Deadline: ${task.deadline.toISOString()}`);
        
        const user = await UserUtils.getUserProfile(task.discordUserId);
        
        if (user && user.isOnHiatus) {
            console.log(`[REMINDER-CHECK]   ⏸️  SKIPPED - User is on hiatus\n`);
            remindersSkipped++;
            continue;
        }
        
        const timeUntilDeadline = task.deadline.getTime() - Date.now();
        const daysLeft = Math.ceil(timeUntilDeadline / (24 * 60 * 60 * 1000));
        const hoursLeft = Math.ceil(timeUntilDeadline / (60 * 60 * 1000));
        const minutesLeft = Math.ceil(timeUntilDeadline / (60 * 1000));
        
        console.log(`[REMINDER-CHECK]   ⏰ Time remaining: ${daysLeft}d ${hoursLeft}h ${minutesLeft}m`);
        
        const timeString = daysLeft >= 1 ? `${daysLeft} day(s)` : `${hoursLeft} hour(s)`;
        const deadlineTs = Math.round(task.deadline.getTime() / 1000);
        
        const reminderEmoji = reminderType === 'final' ? '🚨' : '⏰';
        const reminderLabel = reminderType === 'final' ? '**FINAL REMINDER**' : '**Friendly Reminder**';
        const encouragement = reminderType === 'final' ? 'You can do this! The deadline is almost here, so let\'s give it our all~ ♪' : 'Keep up the great work! ♪';
        
        const reminderChannel = guild.channels.cache.get(config.REMINDER_CHANNEL_ID);
        if (reminderChannel) {
            console.log(`[REMINDER-CHECK]   📤 Sending ${reminderType} reminder to channel ${config.REMINDER_CHANNEL_ID}...`);
            await reminderChannel.send(
                `${reminderEmoji} ${reminderLabel}\n<@${task.discordUserId}> Your task **${task.taskName || task.taskType}** (${task.roleName}) is due in **${timeString}**!\n${encouragement}\n📅 Deadline: <t:${deadlineTs}:F> (<t:${deadlineTs}:R>)`
            );
            console.log(`[REMINDER-CHECK]   ✅ Reminder sent successfully`);
        } else {
            console.log(`[REMINDER-CHECK]   ❌ ERROR - Reminder channel not found (${config.REMINDER_CHANNEL_ID})`);
        }
        
        await TaskUtils.markReminderSent(task._id, reminderType);
        console.log(`[REMINDER-CHECK]   💾 Marked ${reminderType} reminder as sent in DB\n`);
        remindersSent++;
    }
    
    console.log('[REMINDERS] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`[REMINDERS] 📊 Summary: ${remindersSent} sent, ${remindersSkipped} skipped`);
    console.log('[REMINDERS] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('[OVERDUE] 📋 Fetching overdue tasks...');
    const overdueTasks = await TaskUtils.fetchOverdueTasks();
    console.log(`[OVERDUE] Found ${overdueTasks.length} overdue task(s)\n`);
    
    let overdueProcessed = 0;
    let overdueSkipped = 0;
    
    for (const task of overdueTasks) {
        console.log(`[OVERDUE-CHECK] Task: "${task.taskName || task.taskType}" | User: ${task.discordUserId}`);
        console.log(`[OVERDUE-CHECK]   Role: ${task.roleName}`);
        console.log(`[OVERDUE-CHECK]   Deadline was: ${task.deadline.toISOString()}`);
        
        const user = await UserUtils.getUserProfile(task.discordUserId);
        
        if (user && user.isOnHiatus) {
            console.log(`[OVERDUE-CHECK]   ⏸️  SKIPPED - User is on hiatus\n`);
            overdueSkipped++;
            continue;
        }
        
        console.log(`[OVERDUE-CHECK]   ⚠️  Processing overdue task...`);
        task.status = 'LATE';
        await task.save();
        console.log(`[OVERDUE-CHECK]   💾 Marked task as LATE in DB`);

        const newStrikeCount = await UserUtils.addStrike(task.userId._id);
        console.log(`[OVERDUE-CHECK]   ⚡ Strike added. New total: ${newStrikeCount}/3`);
        
        const logChannel = guild.channels.cache.get(config.LOG_CHANNEL_ID);
        if (logChannel) {
            console.log(`[OVERDUE-CHECK]   📤 Sending overdue notification to log channel...`);
            await logChannel.send(`💔 **Oh no... Deadline Missed**\n<@${task.discordUserId}> The deadline for **${task.taskName || task.taskType}** has passed...\nStrike added. Total: ${newStrikeCount}/3\nLet's work together to stay on track next time, okay? ♪`);
            console.log(`[OVERDUE-CHECK]   ✅ Notification sent`);
        } else {
            console.log(`[OVERDUE-CHECK]   ❌ ERROR - Log channel not found (${config.LOG_CHANNEL_ID})`);
        }
        
        console.log(`[OVERDUE-CHECK]   🔍 Checking for demotion (${newStrikeCount} strikes)...`);
        await Commands.checkDemotion(guild, task.discordUserId, newStrikeCount);
        console.log(`[OVERDUE-CHECK]   ✅ Demotion check complete\n`);
        overdueProcessed++;
    }
    
    console.log('[OVERDUE] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`[OVERDUE] 📊 Summary: ${overdueProcessed} processed, ${overdueSkipped} skipped`);
    console.log('[OVERDUE] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('========================================');
    console.log(`[SCHEDULER] ✅ Completed at ${new Date().toISOString()}`);
    console.log('========================================\n');
}

const commands = [
    new SlashCommandBuilder().setName('assign').setDescription('Assign task')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addStringOption(o => o.setName('role').setDescription('Role').setRequired(true)
            .addChoices(
                { name: 'VA', value: 'VA' },
                { name: 'SVA', value: 'SVA' },
                { name: 'Translyricist', value: 'translyricist' },
                { name: 'Lyricist', value: 'lyricist' },
                { name: 'Composer', value: 'composer' },
                { name: 'Editor', value: 'editor' },
                { name: 'Mixer', value: 'mixer' },
                { name: 'Bot Dev', value: 'BOT DEV' }
            ))
        .addStringOption(o => o.setName('task').setDescription('Task type').setRequired(true)
            .addChoices(
                { name: 'Skit', value: 'skit' },
                { name: 'Story (Editing)', value: 'story' },
                { name: 'Joke Cover', value: 'joke_cover' },
                { name: 'Short Cover', value: 'short_cover' },
                { name: 'Full Cover', value: 'full_cover' },
                { name: 'Short Song', value: 'short_song' },
                { name: 'Long Song', value: 'long_song' },
                { name: 'Color MV', value: 'color_mv' },
                { name: '2D MV', value: '2d_mv' },
                { name: 'Bot Feature', value: 'bot_feature' },
                { name: 'Bug Fix', value: 'bug_fix' },
                { name: 'Custom', value: 'custom' }
            ))
        .addStringOption(o => o.setName('name').setDescription('Task name').setRequired(false))
        .addStringOption(o => o.setName('description').setDescription('Task description').setRequired(false))
        .addIntegerOption(o => o.setName('duration_days').setDescription('Duration in days (ONLY for Custom tasks)').setRequired(false).setMinValue(1))
        .addIntegerOption(o => o.setName('extension_days').setDescription('Extension days (ONLY for Custom tasks)').setRequired(false).setMinValue(1)),
    new SlashCommandBuilder().setName('submit').setDescription('Complete task')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(false))
        .addStringOption(o => o.setName('task').setDescription('Task name (use /tasks to see list)').setRequired(false)),
    new SlashCommandBuilder().setName('extension').setDescription('Request extension')
        .addStringOption(o => o.setName('reason').setDescription('Reason for extension').setRequired(true))
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(false))
        .addStringOption(o => o.setName('task').setDescription('Task name').setRequired(false)),
    new SlashCommandBuilder().setName('profile').setDescription('View profile')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(false)),
    new SlashCommandBuilder().setName('strike').setDescription('Manage strikes')
        .addSubcommand(s => s.setName('list').setDescription('List all users with strikes'))
        .addSubcommand(s => s.setName('add').setDescription('Add Strike').addUserOption(o=>o.setName('user').setDescription('User').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(true)))
        .addSubcommand(s => s.setName('remove').setDescription('Remove Strike').addUserOption(o=>o.setName('user').setDescription('User').setRequired(true))),
    new SlashCommandBuilder().setName('onboard').setDescription('Onboard a new user')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)),
    new SlashCommandBuilder().setName('hiatus').setDescription('Request or grant hiatus')
        .addStringOption(o => o.setName('reason').setDescription('Reason for hiatus').setRequired(true))
        .addUserOption(o => o.setName('user').setDescription('User (owners only - grants directly)').setRequired(false)),
    new SlashCommandBuilder().setName('endhiatus').setDescription('End hiatus (leave blank to end your own)')
        .addUserOption(o => o.setName('user').setDescription('User (optional)').setRequired(false)),
    new SlashCommandBuilder().setName('tasks').setDescription('View detailed tasks')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(false)),
    new SlashCommandBuilder().setName('history').setDescription('View task history')
        .addUserOption(o => o.setName('user').setDescription('Filter by user').setRequired(false))
        .addStringOption(o => o.setName('task').setDescription('Filter by task name').setRequired(false))
        .addStringOption(o => o.setName('status').setDescription('Filter by status')
            .addChoices(
                { name: 'Pending', value: 'PENDING' },
                { name: 'Completed', value: 'COMPLETED' },
                { name: 'Late', value: 'LATE' },
                { name: 'Excused', value: 'EXCUSED' }
            )
            .setRequired(false))
        .addStringOption(o => o.setName('role').setDescription('Filter by role name').setRequired(false)),
    new SlashCommandBuilder().setName('help').setDescription('Show all available commands'),
    new SlashCommandBuilder().setName('ping').setDescription('Check bot response time'),
    new SlashCommandBuilder().setName('uptime').setDescription('Check how long the bot has been running')
].map(c => c.toJSON());


client.once('clientReady', async () => {
    console.log('\n🎤 ═══════════════════════════════════════════');
    console.log(`   Bot Ready: ${client.user.tag}`);
    console.log('   ═══════════════════════════════════════════\n');
    
    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
    try {
        console.log('[STARTUP] Registering slash commands...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('[STARTUP] ✅ Slash Commands Registered\n');
    } catch (e) { 
        console.error('[STARTUP] ❌ Error registering commands:', e);
    }
    
    console.log('[STARTUP] Running initial scheduler check to catch up on missed reminders...');
    try {
        await runScheduler(true);
        console.log('[STARTUP] ✅ Initial check complete\n');
    } catch (e) {
        console.error('[STARTUP] ❌ Error during initial scheduler check:', e);
    }
    
    console.log('[STARTUP] Setting up scheduler...');
    const intervalMs = config.SCHEDULER_INTERVAL_MINUTES * 60 * 1000;
    setInterval(runScheduler, intervalMs);
    console.log(`[STARTUP] ✅ Scheduler will run every ${config.SCHEDULER_INTERVAL_MINUTES} minutes\n`);
    
    console.log('🎤 ═══════════════════════════════════════════');
    console.log('   Miku Bot is ready to help! ♪');
    console.log('   ═══════════════════════════════════════════\n');
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        console.log(`[COMMAND] /${commandName} by ${interaction.user.tag} (${interaction.user.id})`);
        try {
            if (commandName === 'assign') await Commands.handleAssignSlash(interaction);
            if (commandName === 'tasks') await Commands.handleTasksSlash(interaction);
            if (commandName === 'submit') await Commands.handleSubmitSlash(interaction);
            if (commandName === 'extension') await Commands.handleExtensionSlash(interaction);
            if (commandName === 'profile') await Commands.handleProfileSlash(interaction);
            if (commandName === 'strike') await Commands.handleStrikeSlash(interaction);
            if (commandName === 'onboard') await Commands.handleOnboardSlash(interaction);
            if (commandName === 'hiatus') await Commands.handleHiatusSlash(interaction);
            if (commandName === 'endhiatus') await Commands.handleEndHiatusSlash(interaction);
            if (commandName === 'history') await Commands.handleHistorySlash(interaction);
            if (commandName === 'help') await Commands.handleHelpSlash(interaction);
            if (commandName === 'ping') await Commands.handlePingSlash(interaction);
            if (commandName === 'uptime') await Commands.handleUptimeSlash(interaction);
            console.log(`[COMMAND] ✅ /${commandName} completed successfully`);
        } catch (e) {
            console.error(`[COMMAND] ❌ Error in /${commandName}:`, e);
            if (!interaction.replied) interaction.reply({ content: "❌ Error.", flags: 64 });
        }
    }

    if (interaction.isButton()) {
        console.log(`[BUTTON] ${interaction.customId} by ${interaction.user.tag} (${interaction.user.id})`);
        try {
            await interaction.deferUpdate();
            console.log(`[BUTTON]   Interaction deferred`);
            
            const member = await interaction.guild.members.fetch(interaction.user.id);
            const isAdminUser = config.ADMIN_USER_IDS.includes(interaction.user.id);
            const isOwner = isAdminUser || member.roles.cache.has(config.OWNER_ROLE_ID);
            const isManager = isAdminUser || config.MANAGER_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));
            const isManagerOrOwner = isOwner || isManager;
            
            const [action, type, taskId] = interaction.customId.split('_');
            console.log(`[BUTTON]   Action: ${action} | Type: ${type} | Task ID: ${taskId}`);
            
            if (action === 'submit' || action === 'extension') {
                const task = await TaskUtils.fetchTaskById(taskId);
                if (!task) {
                    console.log(`[BUTTON]   ❌ Task not found: ${taskId}`);
                    return interaction.editReply({ content: '❌ Task not found.' });
                }
                
                console.log(`[BUTTON]   Task found: "${task.taskName || task.taskType}" for user ${task.discordUserId}`);

                if (type === 'approve') {
                    if (action === 'submit') {
                        if (!isOwner) {
                            console.log(`[BUTTON]   ❌ Permission denied: Only owners can approve submissions`);
                            return interaction.editReply({ content: 'Thanks for checking, but only owners can approve submissions! ♪' });
                        }
                        console.log(`[BUTTON]   Approving submission...`);
                        await TaskUtils.completeAssignment(task._id, task.userId);
                        const newCount = await UserUtils.removeStrike(task.userId);
                        console.log(`[BUTTON]   Strike removed. New count: ${newCount}/3`);
                        await interaction.editReply({ 
                            content: `✅ Submission approved by <@${interaction.user.id}>`,
                            embeds: interaction.message.embeds,
                            components: []
                        });
                        
                        if (task.submissionChannelId) {
                            const submissionChannel = interaction.guild.channels.cache.get(task.submissionChannelId);
                            if (submissionChannel) {
                                submissionChannel.send(`✨ Congratulations <@${task.discordUserId}>! Your submission for **${task.taskName || task.taskType}** has been approved! Amazing work~ ♪`);
                            }
                        }
                        
                        const logChannel = interaction.guild.channels.cache.get(config.LOG_CHANNEL_ID);
                        if (logChannel) {
                            logChannel.send(`✅ **${task.taskName || task.taskType}** completed by <@${task.discordUserId}>! Amazing work~ Strike removed. Current: ${newCount}/3 ♪`);
                        }
                        console.log(`[BUTTON]   ✅ Submission approved successfully`);
                    } else if (action === 'extension') {
                        if (!isManagerOrOwner) {
                            console.log(`[BUTTON]   ❌ Permission denied: Only managers/owners can approve extensions`);
                            return interaction.editReply({ content: 'Extension approvals are handled by managers and owners! Thanks for checking though~ ♪' });
                        }
                        console.log(`[BUTTON]   Approving extension...`);
                        const rule = config.RULES[task.roleCategoryId];
                        let extTime = task.customExtension || rule.extension;
                        if (!extTime) extTime = (task.taskType.includes('skit')) ? rule.extension_skit : rule.extension_mv;
                        console.log(`[BUTTON]   Extension duration: ${extTime / (24 * 60 * 60 * 1000)} days`);
                        
                        const updated = await TaskUtils.extendAssignment(task._id, extTime);
                        const ts = Math.round(updated.deadline.getTime() / 1000);
                        console.log(`[BUTTON]   New deadline: ${updated.deadline.toISOString()}`);
                        await interaction.editReply({
                            content: `✅ Extension approved by <@${interaction.user.id}>`,
                            embeds: interaction.message.embeds,
                            components: []
                        });
                        
                        if (task.submissionChannelId) {
                            const submissionChannel = interaction.guild.channels.cache.get(task.submissionChannelId);
                            if (submissionChannel) {
                                submissionChannel.send(`✨ Good news <@${task.discordUserId}>! Your extension request for **${task.taskName || task.taskType}** has been approved! New deadline: <t:${ts}:F> ♪`);
                            }
                        }
                        
                        const logChannel = interaction.guild.channels.cache.get(config.LOG_CHANNEL_ID);
                        if (logChannel) {
                            logChannel.send(`⏰ Extension granted for <@${task.discordUserId}> - **${task.taskName || task.taskType}**! New deadline: <t:${ts}:F> ♪`);
                        }
                        console.log(`[BUTTON]   ✅ Extension approved successfully`);
                    }
                } else if (type === 'deny') {
                    if (action === 'submit' && !isOwner) {
                        console.log(`[BUTTON]   ❌ Permission denied: Only owners can deny submissions`);
                        return interaction.editReply({ content: 'Thanks for checking, but only owners can deny submissions! ♪' });
                    }
                    if (action === 'extension' && !isManagerOrOwner) {
                        console.log(`[BUTTON]   ❌ Permission denied: Only managers/owners can deny extensions`);
                        return interaction.editReply({ content: 'Extension decisions are handled by managers and owners! Thanks for checking though~ ♪' });
                    }
                    console.log(`[BUTTON]   Denying ${action}...`);
                    await interaction.editReply({
                        content: `❌ ${action === 'submit' ? 'Submission' : 'Extension'} denied by <@${interaction.user.id}>`,
                        embeds: interaction.message.embeds,
                        components: []
                    });
                    
                    if (task.submissionChannelId) {
                        const submissionChannel = interaction.guild.channels.cache.get(task.submissionChannelId);
                        if (submissionChannel) {
                            const actionText = action === 'submit' ? 'submission' : 'extension request';
                            submissionChannel.send(`<@${task.discordUserId}> Your ${actionText} for **${task.taskName || task.taskType}** was not approved. Please check with staff for feedback! 💖`);
                        }
                    }
                    console.log(`[BUTTON]   ✅ ${action} denied successfully`);
                }
            } else if (action === 'hiatus') {
                const userId = taskId;
                const hiatusChannelId = interaction.message.embeds[0]?.footer?.text?.match(/Channel: (\d+)/)?.[1];
                console.log(`[BUTTON]   Processing hiatus ${type} for user ${userId}`);
                
                if (!isManagerOrOwner) {
                    console.log(`[BUTTON]   ❌ Permission denied: Only managers/owners can handle hiatus requests`);
                    return interaction.editReply({ content: 'Hiatus requests are handled by managers and owners! Thanks for looking out for everyone though~ ♪' });
                }
                
                if (type === 'approve') {
                    console.log(`[BUTTON]   Approving hiatus...`);
                    await UserUtils.setHiatus(userId, true);
                    
                    const Assignment = (await import('./DB/Schemas/assignment.js')).default;
                    const pendingTasks = await Assignment.find({
                        discordUserId: userId,
                        status: 'PENDING'
                    });
                    
                    console.log(`[BUTTON]   Found ${pendingTasks.length} pending tasks to pause`);
                    for (const task of pendingTasks) {
                        task.deadline = new Date('2099-12-31');
                        task.firstReminderSent = true;
                        task.finalReminderSent = true;
                        await task.save();
                    }
                    console.log(`[BUTTON]   Paused all deadlines`);
                    
                    await interaction.editReply({
                        content: `✅ Hiatus approved by <@${interaction.user.id}>`,
                        embeds: interaction.message.embeds,
                        components: []
                    });
                    
                    if (hiatusChannelId) {
                        const hiatusChannel = interaction.guild.channels.cache.get(hiatusChannelId);
                        if (hiatusChannel) {
                            hiatusChannel.send(`🌸 <@${userId}> Your hiatus request has been approved! All your tasks are paused. Take care and come back when you're ready~ ♪`);
                        }
                    }
                    
                    const logChannel = interaction.guild.channels.cache.get(config.LOG_CHANNEL_ID);
                    if (logChannel) {
                        logChannel.send(`🏖️ Hiatus approved for <@${userId}>. All ${pendingTasks.length} pending task(s) paused. Take the time you need!`);
                    }
                    console.log(`[BUTTON]   ✅ Hiatus approved successfully with ${pendingTasks.length} tasks paused`);
                } else if (type === 'deny') {
                    console.log(`[BUTTON]   Denying hiatus...`);
                    await interaction.editReply({
                        content: `❌ Hiatus denied by <@${interaction.user.id}>`,
                        embeds: interaction.message.embeds,
                        components: []
                    });
                    
                    if (hiatusChannelId) {
                        const hiatusChannel = interaction.guild.channels.cache.get(hiatusChannelId);
                        if (hiatusChannel) {
                            hiatusChannel.send(`<@${userId}> Your hiatus request was not approved. Please reach out to staff if you have questions! 💖`);
                        }
                    }
                    console.log(`[BUTTON]   ✅ Hiatus denied successfully`);
                }
            }
        } catch (e) {
            console.error(`[BUTTON] ❌ Error processing ${interaction.customId}:`, e);
            if (!interaction.replied && !interaction.deferred) {
                interaction.reply({ content: "❌ Error processing request.", flags: 64 });
            } else if (interaction.deferred) {
                interaction.editReply({ content: "❌ Error processing request." });
            }
        }
    }
});


client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;

    const commandName = message.content.split(' ')[0].substring(1);
    console.log(`[PREFIX] !${commandName} by ${message.author.tag} (${message.author.id})`);
    try {
        await Commands.handlePrefixCommand(message);
        console.log(`[PREFIX] ✅ !${commandName} completed successfully`);
    } catch (e) {
        console.error(`[PREFIX] ❌ Error in !${commandName}:`, e);
        message.reply("❌ Error executing command.");
    }
});

console.log('[STARTUP] Logging in to Discord...');
client.login(process.env.BOT_TOKEN).catch(err => {
    console.error('[STARTUP] ❌ Failed to login to Discord:', err);
    process.exit(1);
});