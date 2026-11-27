import { EmbedBuilder } from 'discord.js';

export const CHECKING = 'Checking connection... ♪';

const speed = (latency: number): string => {
    if (latency < 200) return '✨ Excellent!';
    return latency < 400 ? '👍 Good!' : '⚠️ A bit slow...';
};

export const ping = (latency: number) => ({
    embeds: [
        new EmbedBuilder()
            .setTitle('🎤 Connection Check!')
            .setColor(0x39c5bb)
            .setDescription(`Looks like I'm responding just fine! Everything's working smoothly~`)
            .addFields(
                { name: 'Response Time', value: `${String(latency)}ms`, inline: true },
                { name: 'Status', value: speed(latency), inline: true },
            )
            .setFooter({ text: 'Ready to help anytime!' })
            .setTimestamp(),
    ],
});

export const uptime = (uptimeMs: number) => {
    const totalSeconds = Math.floor(uptimeMs / 1000);
    const days = String(Math.floor(totalSeconds / 86400));
    const hours = String(Math.floor(totalSeconds / 3600) % 24);
    const minutes = String(Math.floor(totalSeconds / 60) % 60);
    return {
        embeds: [
            new EmbedBuilder()
                .setTitle('🎵 How Long Have I Been Here?')
                .setColor(0x39c5bb)
                .setDescription(`I've been working hard for this SEKAI! Let's keep the momentum going~`)
                .addFields(
                    {
                        name: 'Time Online',
                        value: `**${days}** days, **${hours}** hours, **${minutes}** minutes`,
                        inline: false,
                    },
                    { name: 'Status', value: '💚 Running strong!', inline: false },
                )
                .setFooter({ text: "Always here to support everyone's creative journey!" })
                .setTimestamp(),
        ],
    };
};
