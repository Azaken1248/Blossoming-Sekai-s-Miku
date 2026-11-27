import dotenv from 'dotenv';
import { Client, GatewayIntentBits, Partials, REST, Routes } from 'discord.js';
import connectDB from './DB/db.js';

import * as Commands from './Utils/DiscordUtils/commands.js';
import { handleApprovalButton, ownsButton } from './Discord/components/approvals.ts';
import { COMMAND_DEFINITIONS } from './Discord/definitions.ts';
import { startScheduler } from './Discord/scheduler.ts';

dotenv.config();

console.log('[STARTUP] Connecting to MongoDB...');
connectDB().then(() => {
    console.log('[STARTUP] ✅ MongoDB connected\n');
});

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [Partials.GuildMember],
});

client.once('clientReady', async () => {
    console.log('\n🎤 ═══════════════════════════════════════════');
    console.log(`   Bot Ready: ${client.user.tag}`);
    console.log('   ═══════════════════════════════════════════\n');

    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
    try {
        console.log('[STARTUP] Registering slash commands...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: COMMAND_DEFINITIONS });
        console.log('[STARTUP] ✅ Slash Commands Registered\n');
    } catch (e) {
        console.error('[STARTUP] ❌ Error registering commands:', e);
    }

    await startScheduler(client);

    console.log('🎤 ═══════════════════════════════════════════');
    console.log('   Miku Bot is ready to help! ♪');
    console.log('   ═══════════════════════════════════════════\n');
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        console.log(`[COMMAND] /${commandName} by ${interaction.user.tag} (${interaction.user.id})`);
        try {
            if (commandName === 'assign') await Commands.handleAssignSlash(interaction);
            if (commandName === 'bulkassign') await Commands.handleBulkAssignSlash(interaction);
            if (commandName === 'tasks') await Commands.handleTasksSlash(interaction);
            if (commandName === 'submit') await Commands.handleSubmitSlash(interaction);
            if (commandName === 'extension') await Commands.handleExtensionSlash(interaction);
            if (commandName === 'profile') await Commands.handleProfileSlash(interaction);
            if (commandName === 'card') await Commands.handleCardSlash(interaction);
            if (commandName === 'strike') await Commands.handleStrikeSlash(interaction);
            if (commandName === 'onboard') await Commands.handleOnboardSlash(interaction);
            if (commandName === 'deboard') await Commands.handleDeboardSlash(interaction);
            if (commandName === 'removetask') await Commands.handleRemoveTaskSlash(interaction);
            if (commandName === 'hiatus') await Commands.handleHiatusSlash(interaction);
            if (commandName === 'endhiatus') await Commands.handleEndHiatusSlash(interaction);
            if (commandName === 'history') await Commands.handleHistorySlash(interaction);
            if (commandName === 'checkfree') await Commands.handleCheckFreeSlash(interaction);
            if (commandName === 'help') await Commands.handleHelpSlash(interaction);
            if (commandName === 'ping') await Commands.handlePingSlash(interaction);
            if (commandName === 'uptime') await Commands.handleUptimeSlash(interaction);
            console.log(`[COMMAND] ✅ /${commandName} completed successfully`);
        } catch (e) {
            console.error(`[COMMAND] ❌ Error in /${commandName}:`, e);
            // Every handler defers first, so `replied` is false but `deferred` is
            // true - calling reply() here would throw and the user would see
            // nothing at all.
            const payload = { content: '❌ Something went wrong running that command.' };
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(payload);
                } else {
                    await interaction.reply({ ...payload, flags: 64 });
                }
            } catch (replyError) {
                console.error(`[COMMAND] ❌ Could not report the error to the user:`, replyError);
            }
        }
    }

    if (interaction.isButton()) {
        if (!ownsButton(interaction.customId)) return;
        await handleApprovalButton(interaction);
    }

    if (interaction.isStringSelectMenu()) {
        try {
            if (interaction.customId.startsWith('submit_select_')) {
                console.log(`[SELECT] ${interaction.customId} by ${interaction.user.tag} (${interaction.user.id})`);
                await Commands.handleSelectSubmit(interaction);
            }
        } catch (e) {
            console.error(`[SELECT] ❌ Error processing ${interaction.customId}:`, e);
            if (!interaction.replied && !interaction.deferred) {
                interaction.reply({ content: '❌ Error processing request.', flags: 64 });
            } else if (interaction.deferred) {
                interaction.editReply({ content: '❌ Error processing request.' });
            }
        }
    }

    if (interaction.isUserSelectMenu()) {
        try {
            if (interaction.customId.startsWith('bulkassign_select_')) {
                console.log(
                    `[USER_SELECT] ${interaction.customId} by ${interaction.user.tag} (${interaction.user.id})`,
                );
                await Commands.handleBulkAssignSelect(interaction);
            }
        } catch (e) {
            console.error(`[USER_SELECT] ❌ Error processing ${interaction.customId}:`, e);
            if (!interaction.replied && !interaction.deferred) {
                interaction.reply({ content: '❌ Error processing request.', flags: 64 });
            } else if (interaction.deferred) {
                interaction.editReply({ content: '❌ Error processing request.' });
            }
        }
    }
});

console.log('[STARTUP] Logging in to Discord...');
client.login(process.env.BOT_TOKEN).catch((err) => {
    console.error('[STARTUP] ❌ Failed to login to Discord:', err);
    process.exit(1);
});
