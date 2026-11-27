import dotenv from 'dotenv';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import connectDB from '../DB/db.js';

import { registerCommands } from './registration.ts';
import { type IncomingInteraction, routeInteraction } from './router.ts';
import { type SchedulerClient, startScheduler } from './scheduler.ts';

dotenv.config({ quiet: true });

const BANNER = '═══════════════════════════════════════════';

console.log('[STARTUP] Connecting to MongoDB...');
void connectDB().then(() => {
    console.log('[STARTUP] ✅ MongoDB connected\n');
});

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [Partials.GuildMember],
});

client.once('clientReady', async (ready) => {
    console.log(`\n🎤 ${BANNER}`);
    console.log(`   Bot Ready: ${ready.user.tag}`);
    console.log(`   ${BANNER}\n`);
    await registerCommands(ready.user.id);
    await startScheduler(ready as unknown as SchedulerClient);
    console.log(`🎤 ${BANNER}`);
    console.log('   Miku Bot is ready to help! ♪');
    console.log(`   ${BANNER}\n`);
});

client.on('interactionCreate', (interaction) => routeInteraction(interaction as unknown as IncomingInteraction));

console.log('[STARTUP] Logging in to Discord...');
client.login(process.env['BOT_TOKEN']).catch((err: unknown) => {
    console.error('[STARTUP] ❌ Failed to login to Discord:', err);
    process.exit(1);
});
