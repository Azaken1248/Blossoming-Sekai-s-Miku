import type { CommandInteraction } from '../ports.ts';
import { help } from '../views/help.ts';
import { CHECKING, ping, uptime } from '../views/status.ts';

export const handleHelp = async (interaction: CommandInteraction) => {
    await interaction.deferReply();
    return interaction.editReply(help());
};

export const handlePing = async (interaction: CommandInteraction) => {
    await interaction.deferReply();
    const sent = await interaction.editReply(CHECKING);
    return interaction.editReply(ping(sent.createdTimestamp - interaction.createdTimestamp));
};

export const handleUptime = async (interaction: CommandInteraction) => {
    await interaction.deferReply();
    return interaction.editReply(uptime(interaction.client.uptime));
};
