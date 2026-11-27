import { REST, Routes } from 'discord.js';
import { COMMAND_DEFINITIONS } from './definitions.ts';

export const registerCommands = async (applicationId: string): Promise<void> => {
    const rest = new REST({ version: '10' }).setToken(process.env['BOT_TOKEN'] ?? '');
    try {
        console.log('[STARTUP] Registering slash commands...');
        await rest.put(Routes.applicationCommands(applicationId), { body: COMMAND_DEFINITIONS });
        console.log('[STARTUP] ✅ Slash Commands Registered\n');
    } catch (e) {
        console.error('[STARTUP] ❌ Error registering commands:', e);
    }
};
