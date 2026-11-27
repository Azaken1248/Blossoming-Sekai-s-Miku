import { EmbedBuilder } from 'discord.js';

export const help = () => {
    const embed = new EmbedBuilder()
        .setTitle("🎤 Miku's Command Guide ♪")
        .setColor(0x39c5bb)
        .setDescription(
            "Yahallo~! ✨ I'm here to help make our SEKAI amazing! Here are all the ways we can work together~ Let's create something wonderful! ♪\n\n🎵 Use `/` to see every command",
        )
        .setTimestamp();

    embed.addFields({
        name: '✨ Task Management',
        value: '`/assign` - Assign tasks (supports Custom tasks with duration_days & extension_days!)\n`/submit` - Submit your amazing work! (needs approval~)\n`/extension` - Need more time? Request with a reason (requires approval)\n`/tasks` - See all your current assignments\n`/checkfree` - See who is available or check a specific user! ♪',
        inline: false,
    });

    embed.addFields({
        name: '🌟 User Management',
        value: '`/onboard` - Welcome new crew members!\n`/profile` - Check your stats and achievements~\n`/card` - View your ID card (like the website card!) or `/card @user` for someone else\n`/strike add/remove` - Manage strikes (add requires reason)\n`/hiatus` - Request a break with reason (needs approval)\n`/endhiatus` - Come back from hiatus (leave blank for yourself!)',
        inline: false,
    });

    embed.addFields({
        name: '📚 History & Tracking',
        value: '`/history` - View complete task history with filters\n🔍 Filters: user, task name, status (PENDING/COMPLETED/LATE), role',
        inline: false,
    });

    embed.addFields({
        name: '🔔 Special Features',
        value: '• **Custom Tasks**: Use `task:Custom` with `duration_days` & optional `extension_days`\n• **Smart Reminders**: Get notified before deadlines!\n• **Hiatus System**: Tasks pause during hiatus, fresh deadlines on return\n• **Approval System**: Submissions, extensions, and hiatus need staff approval',
        inline: false,
    });

    embed.addFields({
        name: '💡 Tips for Success~',
        value: '• Always specify which task when submitting if you have multiple!\n• Extensions can only be used once per task\n• Tasks on hiatus show "N/A" for deadline\n• Reminders are sent at configured intervals\n• Completing tasks removes a strike - keep up the good work! ♪',
        inline: false,
    });

    return { embeds: [embed] };
};
