import dotenv from 'dotenv';
import { Client, GatewayIntentBits, Partials, SlashCommandBuilder, REST, Routes } from 'discord.js';
import connectDB from './DB/db.js';
import config from './config.js';

import * as Commands from './Utils/DiscordUtils/commands.js';
import * as TaskUtils from './Utils/DBUtils/taskUtils.js';
import * as UserUtils from './Utils/DBUtils/userUtils.js';

dotenv.config();
connectDB();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent 
    ],
    partials: [Partials.GuildMember]
});

async function runScheduler() {
    console.log('Checking Deadlines...');
    const overdueTasks = await TaskUtils.fetchOverdueTasks();
    
    for (const task of overdueTasks) {
        const user = await UserUtils.getUserProfile(task.discordUserId);
        
        if (user && user.isOnHiatus) {
            console.log(`Skipping ${task.discordUserId} - on hiatus`);
            continue;
        }
        
        console.log(`Processing overdue: ${task.taskType} for ${task.discordUserId}`);
        task.status = 'LATE';
        await task.save();

        const newStrikeCount = await UserUtils.addStrike(task.userId._id);
        
        const guild = client.guilds.cache.first();
        if (guild) {
            const logChannel = guild.channels.cache.get(config.LOG_CHANNEL_ID);
            if (logChannel) {
                logChannel.send(`❌ **Deadline Missed**\n<@${task.discordUserId}> missed **${task.taskType}**.\nStrike added. Total: ${newStrikeCount}/3`);
            }
            await Commands.checkDemotion(guild, task.discordUserId, newStrikeCount);
        }
    }
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
                { name: 'Mixer', value: 'mixer' }
            ))
        .addStringOption(o => o.setName('task').setDescription('Task type').setRequired(true)
            .addChoices(
                { name: 'Skit', value: 'skit' },
                { name: 'Story', value: 'story' },
                { name: 'Joke Cover', value: 'joke_cover' },
                { name: 'Short Cover', value: 'short_cover' },
                { name: 'Full Cover', value: 'full_cover' },
                { name: 'Short Song', value: 'short_song' },
                { name: 'Long Song', value: 'long_song' },
                { name: 'Color MV', value: 'color_mv' },
                { name: '2D MV', value: '2d_mv' }
            ))
        .addStringOption(o => o.setName('name').setDescription('Task name').setRequired(false))
        .addStringOption(o => o.setName('description').setDescription('Task description').setRequired(false)),
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
        .addSubcommand(s => s.setName('add').setDescription('Add Strike').addUserOption(o=>o.setName('user').setDescription('User').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(true)))
        .addSubcommand(s => s.setName('remove').setDescription('Remove Strike').addUserOption(o=>o.setName('user').setDescription('User').setRequired(true))),
    new SlashCommandBuilder().setName('onboard').setDescription('Onboard a new user')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)),
    new SlashCommandBuilder().setName('hiatus').setDescription('Manage hiatus status')
        .addSubcommand(s => s.setName('on').setDescription('Enable hiatus').addUserOption(o=>o.setName('user').setDescription('User').setRequired(true)))
        .addSubcommand(s => s.setName('off').setDescription('Disable hiatus').addUserOption(o=>o.setName('user').setDescription('User').setRequired(true))),
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
    new SlashCommandBuilder().setName('help').setDescription('Show all available commands')
].map(c => c.toJSON());


client.once('clientReady', async () => {
    console.log(`Bot Ready: ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Slash Commands Registered');
    } catch (e) { console.error(e); }
    
    setInterval(runScheduler, 1000 * 60 * 60);
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        try {
            if (commandName === 'assign') await Commands.handleAssignSlash(interaction);
            if (commandName === 'tasks') await Commands.handleTasksSlash(interaction);
            if (commandName === 'submit') await Commands.handleSubmitSlash(interaction);
            if (commandName === 'extension') await Commands.handleExtensionSlash(interaction);
            if (commandName === 'profile') await Commands.handleProfileSlash(interaction);
            if (commandName === 'strike') await Commands.handleStrikeSlash(interaction);
            if (commandName === 'onboard') await Commands.handleOnboardSlash(interaction);
            if (commandName === 'hiatus') await Commands.handleHiatusSlash(interaction);
            if (commandName === 'history') await Commands.handleHistorySlash(interaction);
            if (commandName === 'help') await Commands.handleHelpSlash(interaction);
        } catch (e) {
            console.error("Slash Error:", e);
            if (!interaction.replied) interaction.reply({ content: "❌ Error.", ephemeral: true });
        }
    }

    if (interaction.isButton()) {
        try {
            const [action, type, taskId] = interaction.customId.split('_');
            
            if (action === 'submit' || action === 'extension') {
                const task = await TaskUtils.fetchTaskById(taskId);
                if (!task) {
                    return interaction.reply({ content: '❌ Task not found.', ephemeral: true });
                }

                if (type === 'approve') {
                    if (action === 'submit') {
                        await TaskUtils.completeAssignment(task._id, task.userId);
                        const newCount = await UserUtils.removeStrike(task.userId);
                        await interaction.update({ 
                            content: `✅ Submission approved by <@${interaction.user.id}>`,
                            embeds: interaction.message.embeds,
                            components: []
                        });
                        const logChannel = interaction.guild.channels.cache.get(config.LOG_CHANNEL_ID);
                        if (logChannel) {
                            logChannel.send(`✅ **${task.taskName || task.taskType}** completed by <@${task.discordUserId}>. Strike removed. Current: ${newCount}/3`);
                        }
                    } else if (action === 'extension') {
                        const rule = config.RULES[task.roleCategoryId];
                        let extTime = rule.extension;
                        if (!extTime) extTime = (task.taskType.includes('skit')) ? rule.extension_skit : rule.extension_mv;
                        
                        const updated = await TaskUtils.extendAssignment(task._id, extTime);
                        const ts = Math.round(updated.deadline.getTime() / 1000);
                        await interaction.update({
                            content: `✅ Extension approved by <@${interaction.user.id}>`,
                            embeds: interaction.message.embeds,
                            components: []
                        });
                        const logChannel = interaction.guild.channels.cache.get(config.LOG_CHANNEL_ID);
                        if (logChannel) {
                            logChannel.send(`⏰ Extension granted for <@${task.discordUserId}> - **${task.taskName || task.taskType}**. New deadline: <t:${ts}:F>`);
                        }
                    }
                } else if (type === 'deny') {
                    await interaction.update({
                        content: `❌ ${action === 'submit' ? 'Submission' : 'Extension'} denied by <@${interaction.user.id}>`,
                        embeds: interaction.message.embeds,
                        components: []
                    });
                }
            }
        } catch (e) {
            console.error("Button Error:", e);
            if (!interaction.replied) interaction.reply({ content: "❌ Error processing request.", ephemeral: true });
        }
    }
});


client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;

    try {
        await Commands.handlePrefixCommand(message);
    } catch (e) {
        console.error("Prefix Error:", e);
        message.reply("❌ Error executing command.");
    }
});

client.login(process.env.BOT_TOKEN);