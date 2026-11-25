import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder,
    StringSelectMenuBuilder,
    UserSelectMenuBuilder,
} from 'discord.js';
import config from '../../config.js';
import {
    assignmentService,
    cardService,
    extensionService,
    hiatusService,
    memberService,
    strikeService,
    submissionService,
} from '../../Services/index.ts';
import { isManagerOrOwner, isOwner, roleIdsOf } from './access.js';
import { taskTitle } from '../domain/assignments.ts';
import { MINUTE } from '../domain/durations.ts';
import { DomainError } from '../domain/errors.ts';
import { crewRoleNames, heldCrewRoles } from '../domain/roles.ts';
import { msToDays, MAX_EXTENSIONS_PER_TASK } from '../domain/extensions.ts';
import { MAX_STRIKES, shouldDemote, formatStrikes } from '../domain/strikes.ts';

// A deboarded member keeps their record but is no longer active, so an
// existence check is not enough on its own.
const isOnboarded = async (userId) => {
    return await memberService.isOnboarded(userId);
};

const logAction = async (guild, content, executorUser) => {
    const channel = guild.channels.cache.get(config.LOG_CHANNEL_ID);
    if (channel) {
        const timestamp = new Date().toLocaleTimeString();
        await channel.send(`\`[${timestamp}]\` 🎵 **${executorUser.username}**: ${content}`).catch(console.error);
    } else {
        console.warn(`[LOG-ACTION] ⚠️ Log channel ${config.LOG_CHANNEL_ID} not found! Content: ${content}`);
    }
};

export const checkDemotion = async (guild, discordId, currentStrikes) => {
    if (!shouldDemote(currentStrikes)) return;

    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member) return;

    // Only act if they still hold at least one crew role, so a repeat call
    // (or a strike applied while already at the cap) is a no-op rather than a
    // duplicate demotion DM.
    const crewRoles = heldCrewRoles(roleIdsOf(member), config.CREW_ROLE_IDS);
    if (crewRoles.length === 0) return;

    await member.roles.remove(crewRoles).catch(() => {});
    await member
        .send(
            `🚨 **Important Notice:** You've reached ${MAX_STRIKES} strikes and your crew roles have been removed. Don't give up though - you can always make a comeback! ♪`,
        )
        .catch(() => {});
    const channel = guild.channels.cache.get(config.LOG_CHANNEL_ID);
    if (channel)
        channel.send(
            `🚨 **Demotion Notice** - <@${discordId}> has reached ${MAX_STRIKES} strikes and crew roles have been removed.`,
        );
};

const refusalFor = (error, wording) => {
    if (!(error instanceof DomainError) || !(error.code in wording)) throw error;
    return { content: wording[error.code](error.details, error) };
};

const ASSIGN_REFUSALS = {
    CUSTOM_DURATION_REQUIRED: () => '\u274c For custom tasks, you must specify duration_days (greater than 0).',
    CUSTOM_FIELDS_NOT_ALLOWED: () =>
        '\u274c duration_days and extension_days are only for Custom tasks. For standard tasks, duration is automatically set based on the task type.',
    MEMBER_NOT_IN_GUILD: () => '\u274c User not found in server.',
    ROLE_MISSING: ({ roleName }) => `\u274c User doesn't have the '${roleName}' role.`,
    TASK_TYPE_INVALID: ({ taskType, roleName, validTasks }) =>
        `\u274c Task type '${taskType}' is not valid for role '${roleName}'.\nValid tasks: ${validTasks.join(', ')}`,
};

const assignTo = async (guild, targetUser, request) => {
    const member = await guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) throw new DomainError('MEMBER_NOT_IN_GUILD');
    return assignmentService.assign({
        ...request,
        target: { discordId: targetUser.id, username: targetUser.username },
        roleIds: roleIdsOf(member),
    });
};

const coreAssign = async (guild, author, targetUser, request) => {
    let task;
    try {
        task = await assignTo(guild, targetUser, request);
    } catch (error) {
        return refusalFor(error, ASSIGN_REFUSALS);
    }

    await logAction(
        guild,
        `✨ Assigned **${task.taskType}** to <@${targetUser.id}> - Let's create something wonderful!`,
        author,
    );
    const ts = Math.round(task.deadline.getTime() / 1000);
    return {
        content: `✨ Assigned **${task.taskType}** to <@${targetUser.id}>! Let's create something wonderful together!\n📅 Deadline: <t:${ts}:F> (<t:${ts}:R>)`,
    };
};

const submitPicker = (discordId, tasks) => {
    const select = new StringSelectMenuBuilder()
        .setCustomId(`submit_select_${discordId}`)
        .setPlaceholder('Select task(s) to submit...')
        .setMinValues(1)
        .setMaxValues(Math.min(tasks.length, 25))
        .addOptions(
            tasks.map((t) => {
                const name = taskTitle(t).substring(0, 90);
                const deadlineStr = new Date(t.deadline).toLocaleDateString();
                const isLate = t.status === 'LATE' ? ' [LATE]' : '';
                return {
                    label: `${name}${isLate}`,
                    description: `Role: ${t.roleName} | Due: ${deadlineStr}`,
                    value: t.id,
                };
            }),
        );
    const row = new ActionRowBuilder().addComponents(select);
    return { content: `✨ Please select the task(s) you want to submit:`, components: [row] };
};

const SUBMIT_REFUSALS = {
    NO_PENDING_TASKS: () => '⚠️ No pending assignments found for this user.',
    TASK_GONE: () => '⚠️ Task not found. It might have been already submitted or removed.',
    TASK_NAME_UNKNOWN: ({ taskName }) => `⚠️ Task '${taskName}' not found. Use \`/tasks\` to see available tasks.`,
};

const sendForReview = async (guild, discordId, task) => {
    const isLate = task.status === 'LATE';
    const embed = new EmbedBuilder()
        .setTitle(isLate ? '⚠️ Late Submission Ready for Review! ♪' : '✨ Submission Ready for Review! ♪')
        .setColor(isLate ? 0xfab387 : 0x39c5bb)
        .setDescription(
            isLate
                ? `<@${discordId}> has finished their task, although it was submitted after the deadline. Let's take a look~ 🎉`
                : `Yay! <@${discordId}> has finished their task and it's ready to shine! Let's take a look at this amazing work~ 🎉`,
        )
        .addFields(
            { name: 'Task', value: taskTitle(task), inline: true },
            { name: 'Role', value: task.roleName, inline: true },
            { name: 'Type', value: task.taskType, inline: true },
        )
        .setTimestamp();

    if (isLate) {
        const deadlineTs = Math.round(new Date(task.deadline).getTime() / 1000);
        embed.addFields({ name: '⏰ Original Deadline', value: `<t:${deadlineTs}:R>`, inline: true });
    }

    if (task.description) {
        embed.addFields({ name: 'Description', value: task.description, inline: false });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`submit_approve_${task.id}`).setLabel('Approve').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`submit_deny_${task.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger),
    );

    const approvalChannel = guild.channels.cache.get(config.APPROVAL_CHANNEL_ID);
    if (approvalChannel) {
        await approvalChannel.send({ embeds: [embed], components: [row] });
    }
};

const coreSubmit = async (guild, request) => {
    let outcome;
    try {
        outcome = await submissionService.request(request);
    } catch (error) {
        return refusalFor(error, SUBMIT_REFUSALS);
    }
    if (outcome.kind === 'choose') return submitPicker(request.discordId, outcome.tasks);

    await sendForReview(guild, request.discordId, outcome.task);
    return {
        content: `✅ Yay! Your submission for **${taskTitle(outcome.task)}** has been sent for review! Keep up the amazing work~ ♪`,
    };
};

const EXTENSION_REFUSALS = {
    ALREADY_EXTENDED: () =>
        `⚠️ This task has already been extended the maximum number of times (${MAX_EXTENSIONS_PER_TASK}).`,
    CONFIG_MISSING_ROLE: (_details, { message }) => {
        console.error('[EXTENSION] Configuration problem:', message);
        return `⚠️ Configuration error: ${message}. Please contact an admin.`;
    },
    NO_PENDING_TASKS: () => '⚠️ No pending assignments found.',
    REASON_REQUIRED: () => '⚠️ Please provide a reason for the extension request.',
    TASK_AMBIGUOUS: ({ tasks }) => {
        const taskList = tasks.map((task) => `• **${taskTitle(task)}** (${task.roleName})`).join('\n');
        return `⚠️ Please specify which task:\n${taskList}\n\nUse: \`/extension task:<task_name> reason:<reason>\``;
    },
    TASK_NAME_UNKNOWN: ({ taskName }) => `⚠️ Task '${taskName}' not found.`,
};

const coreExtension = async (guild, request) => {
    const { discordId, reason } = request;
    let outcome;
    try {
        outcome = await extensionService.request(request);
    } catch (error) {
        return refusalFor(error, EXTENSION_REFUSALS);
    }

    const { task, extensionMs } = outcome;
    const extDays = msToDays(extensionMs);

    const embed = new EmbedBuilder()
        .setTitle('🌸 Extension Request ♪')
        .setColor(0x39c5bb)
        .setDescription(
            `<@${discordId}> needs a bit more time to make something truly special! Everyone deserves the time to do their best~ ✨`,
        )
        .addFields(
            { name: 'Task', value: taskTitle(task), inline: true },
            { name: 'Role', value: task.roleName, inline: true },
            { name: 'Extension', value: `${extDays} days`, inline: true },
            { name: 'Current Deadline', value: `<t:${Math.round(task.deadline.getTime() / 1000)}:F>`, inline: false },
            { name: 'Reason', value: reason, inline: false },
        )
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`extension_approve_${task.id}`)
            .setLabel('Approve')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`extension_deny_${task.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger),
    );

    const approvalChannel = guild.channels.cache.get(config.APPROVAL_CHANNEL_ID);
    if (approvalChannel) {
        await approvalChannel.send({ embeds: [embed], components: [row] });
    }

    return {
        content: `✅ Extension request sent for **${taskTitle(task)}**! Don't worry, everyone needs extra time sometimes~ ♪`,
    };
};

const coreProfile = async (targetUser, guild = null) => {
    if (targetUser.id === '1449394728863924354') {
        const embed = new EmbedBuilder()
            .setTitle('🎤 Hatsune Miku')
            .setColor(0x39c5bb)
            .setDescription('Oh! You want to know about me? Alright then!')
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                {
                    name: 'About Me',
                    value: "I'm Hatsune Miku! I'm here to help everyone in this SEKAI work together and create something wonderful. Managing tasks, keeping track of deadlines, sending reminders... that's what I do!",
                    inline: false,
                },
                {
                    name: 'My Goal',
                    value: "I want everyone here to reach their full potential! When people work together and support each other, they can accomplish so much more. That's what I believe in!",
                    inline: false,
                },
                {
                    name: 'A Little Secret',
                    value: 'Between you and me... seeing everyone complete their tasks and grow makes me really happy. Keep up the great work, okay?',
                    inline: false,
                },
            )
            .setFooter({ text: "Now then, let's keep moving forward together!" })
            .setTimestamp();

        return { embeds: [embed] };
    }

    let summary;
    try {
        summary = await memberService.profile(targetUser.id);
    } catch (error) {
        return refusalFor(error, { MEMBER_NOT_FOUND: () => 'User not found.' });
    }
    const { member: profile, total, pending, completed, late } = summary;

    if (profile.isDeboarded) {
        const embed = new EmbedBuilder()
            .setTitle(`✨ ${profile.deboardedMessage}`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
            .setColor(0xb9e2f0)
            .setDescription(`This member's adventure in our SEKAI has come to an end, but their legacy remains~ 🌸`)
            .addFields({
                name: 'Deboarded',
                value: `<t:${Math.round(new Date(profile.deboardedAt).getTime() / 1000)}:F>`,
                inline: true,
            })
            .addFields({
                name: 'Completed Tasks',
                value: `✅ ${completed.length}`,
                inline: true,
            })
            .setFooter({
                text: `${new Date(profile.joinedAt).toLocaleDateString()} ~ ${new Date(profile.deboardedAt).toLocaleDateString()}`,
            })
            .setTimestamp();

        if (completed.length > 0) {
            const recentCompleted = completed
                .slice(-5)
                .reverse()
                .map((a) => {
                    const name = taskTitle(a);
                    return `• ${name} (${a.roleName})`;
                })
                .join('\n');
            embed.addFields({ name: '✅ Notable Works', value: recentCompleted, inline: false });
        }

        return { embeds: [embed] };
    }

    let color = 0x89b4fa;
    if (profile.isOnHiatus) color = 0xf9e2af;
    else if (profile.strikes >= MAX_STRIKES) color = 0xf38ba8;
    else if (profile.strikes >= 2) color = 0xfab387;
    else if (pending.length === 0 && completed.length > 0) color = 0xa6e3a1;

    const embed = new EmbedBuilder()
        .setTitle(`🌟 ${profile.username}'s Profile ♪`)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
        .setColor(color)
        .setFooter({ text: `🎵 Part of our SEKAI since ${new Date(profile.joinedAt).toLocaleDateString()}` })
        .setTimestamp();

    embed.addFields({
        name: 'Status',
        value: profile.isOnHiatus ? '🏖️ On Hiatus' : '✅ Active',
        inline: true,
    });

    embed.addFields({
        name: 'Strikes',
        value: `⚡ **${formatStrikes(profile.strikes)}**`,
        inline: true,
    });

    embed.addFields({
        name: 'Total Tasks',
        value: `📊 ${total}`,
        inline: true,
    });

    if (guild) {
        const member = await guild.members.fetch(targetUser.id).catch(() => null);
        if (member) {
            const roleNames = crewRoleNames(roleIdsOf(member), config.CREW_ROLE_IDS, config.RULES);

            if (roleNames.length > 0) {
                embed.addFields({
                    name: '👥 Crew Roles',
                    value: roleNames.map((name) => `• ${name}`).join('\n'),
                    inline: false,
                });
            }
        }
    }

    embed.addFields({
        name: 'Task Statistics',
        value: `✅ Completed: **${completed.length}**\n🗒️ Pending: **${pending.length}**\n❌ Late: **${late.length}**`,
        inline: false,
    });

    if (pending.length > 0) {
        const activeList = pending
            .slice(0, 5)
            .map((a) => {
                const ts = Math.round(new Date(a.deadline).getTime() / 1000);
                const name = taskTitle(a);
                const ext = a.hasExtended ? ' [Ext]' : '';
                return `• **${name}** (${a.roleName}) - <t:${ts}:R>${ext}`;
            })
            .join('\n');
        const more = pending.length > 5 ? `\n*...and ${pending.length - 5} more*` : '';
        embed.addFields({ name: '📝 Active Tasks', value: activeList + more });
    }

    if (completed.length > 0) {
        const recentCompleted = completed
            .slice(-3)
            .reverse()
            .map((a) => {
                const name = taskTitle(a);
                return `• ${name} (${a.roleName})`;
            })
            .join('\n');
        embed.addFields({ name: '✅ Recently Completed', value: recentCompleted, inline: false });
    }

    if (late.length > 0) {
        embed.addFields({
            name: '⚠️ Warning',
            value: `${late.length} task(s) marked as late`,
            inline: false,
        });
    }

    return { embeds: [embed] };
};

const coreCard = async (targetUser, _guild = null) => {
    try {
        const card = await cardService.get(targetUser.id);

        if (card.kind === 'deboarded') {
            const embed = new EmbedBuilder()
                .setTitle(`✨ ${card.member.deboardedMessage}`)
                .setColor(0xb9e2f0)
                .setDescription('This member has completed their journey in the SEKAI~ 🌸')
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
                .setFooter({ text: `Deboarded: ${new Date(card.member.deboardedAt).toLocaleDateString()}` })
                .setTimestamp();

            return { embeds: [embed] };
        }

        const attachment = new AttachmentBuilder(card.image, { name: 'card.png' });

        const embed = new EmbedBuilder()
            .setTitle(`Card for ${targetUser.username}`)
            .setColor(0x39c5bb)
            .setImage('attachment://card.png')
            .setFooter({ text: `ID: ${targetUser.id}` })
            .setTimestamp();

        return { embeds: [embed], files: [attachment] };
    } catch (error) {
        if (error.code === 'CARD_NOT_FOUND') return { content: 'Card not found. Have you joined the Sekai?' };
        console.error('Error fetching card data:', error);
        return { content: 'Failed to load card. Please try again.' };
    }
};

const coreRemoveTask = async (guild, author, targetUser, taskIdentifier) => {
    let removed;
    try {
        removed = await assignmentService.remove(targetUser.id, taskIdentifier);
    } catch (error) {
        return refusalFor(error, {
            TASK_NOT_FOUND: () =>
                `❌ Task not found for <@${targetUser.id}>. Use \`/tasks @user\` to see available tasks.`,
            TASK_IS_PERMANENT: ({ title }) =>
                `❌ Cannot delete **${title}** - this task has been completed and is now part of the permanent record! Their work will be remembered~ 🌸`,
        });
    }
    const { title } = removed;

    await logAction(guild, `🗑️ Removed task **${title}** from <@${targetUser.id}>`, author);
    return {
        content: `✅ Task **${title}** has been removed for <@${targetUser.id}>. Their work remains in the archives~ 🌸`,
    };
};

const STRIKE_REFUSALS = (targetUser) => ({
    MEMBER_NOT_FOUND: () => `❌ Could not find a record for <@${targetUser.id}>.`,
});

const coreStrikeAdd = async (guild, author, targetUser, reason) => {
    const { strikes } = await strikeService.add({ discordId: targetUser.id, username: targetUser.username });

    await logAction(guild, `⚡ Added strike to <@${targetUser.id}>. Reason: ${reason}`, author);
    await checkDemotion(guild, targetUser.id, strikes);

    const capped = strikes >= MAX_STRIKES ? `\n*(already at the maximum of ${MAX_STRIKES})*` : '';
    return {
        content: `⛔ Strike added to <@${targetUser.id}>.\nReason: **${reason}**\nTotal: **${formatStrikes(strikes)}**${capped}`,
    };
};

const coreStrikeRemove = async (guild, author, targetUser) => {
    const { strikes } = await strikeService.remove({ discordId: targetUser.id, username: targetUser.username });

    await logAction(guild, `✨ Removed strike from <@${targetUser.id}> - Great improvement!`, author);
    return { content: `✅ Strike removed for <@${targetUser.id}>.\nTotal: **${formatStrikes(strikes)}**` };
};

const coreStrike = async (guild, author, targetUser, action, reason) => {
    try {
        if (action === 'add') return await coreStrikeAdd(guild, author, targetUser, reason);
        if (action === 'remove') return await coreStrikeRemove(guild, author, targetUser);
    } catch (error) {
        return refusalFor(error, STRIKE_REFUSALS(targetUser));
    }
    return { content: '⚠️ Unknown strike action. Use `add`, `remove` or `list`.' };
};

const coreStrikeList = async (_guild, _author) => {
    const usersWithStrikes = await strikeService.list();

    if (usersWithStrikes.length === 0) {
        return { content: '✨ Wonderful news! No one currently has any strikes. Everyone is doing amazing work! ♪' };
    }

    const description = usersWithStrikes
        .map((u) => {
            return `• <@${u.discordId}>: **${u.strikes}** strike(s)`;
        })
        .join('\n');

    const embed = new EmbedBuilder()
        .setTitle('⚠️ active Strikes List')
        .setColor(0xff6b6b)
        .setDescription(
            `Here is the list of users with active strikes.\nLet's do our best to clear them!\n\n${description}`,
        )
        .setFooter({ text: 'Keep doing your best everyone! ♪' })
        .setTimestamp();

    return { embeds: [embed] };
};

const coreOnboard = async (guild, author, targetUser) => {
    const { status, strikes } = await memberService.onboard(targetUser.id, targetUser.username);

    if (status === 'restored') {
        await logAction(guild, `🌸 Re-onboarded <@${targetUser.id}> - welcome back!`, author);
        return {
            content: `🌸 Welcome back to our SEKAI, <@${targetUser.id}>! Your record has been restored~ ♪\nStrikes: **${formatStrikes(strikes)}**`,
        };
    }

    if (status === 'existing') {
        return {
            content: `✨ <@${targetUser.id}> is already part of our SEKAI!\nStrikes: **${formatStrikes(strikes)}**`,
        };
    }

    await logAction(guild, `🎉 Welcomed <@${targetUser.id}> to our SEKAI!`, author);
    return {
        content: `🎉 Welcome to our SEKAI, <@${targetUser.id}>! I'm so excited to create amazing things with you~ ♪\nStrikes: **${formatStrikes(strikes)}**`,
    };
};

const coreDeboard = async (guild, author, targetUser, customMessage = null) => {
    let deboarded;
    try {
        deboarded = await memberService.deboard(targetUser.id, customMessage);
    } catch (error) {
        return refusalFor(error, {
            MEMBER_NOT_FOUND: () => 'User not found in the database.',
            MEMBER_ALREADY_DEBOARDED: () => `<@${targetUser.id}> has already been deboarded.`,
        });
    }

    await logAction(
        guild,
        `👋 <@${targetUser.id}> has been deboarded. All their work remains in the SEKAI's memory.`,
        author,
    );
    return {
        content: `👋 <@${targetUser.id}> has been safely deboarded. Their completed tasks will remain in our records as a memory of their time with us~ ✨\n✨ Status: ${deboarded.statusMessage}`,
    };
};

const coreTasks = async (targetUser) => {
    let active;
    try {
        active = await memberService.activeTasks(targetUser.id);
    } catch (error) {
        return refusalFor(error, {
            MEMBER_NOT_FOUND: () => 'User not found.',
            MEMBER_DEBOARDED: () =>
                `This member has been deboarded and is no longer part of the active SEKAI. Their completed tasks are archived for remembrance~ ✨`,
            NO_TASKS: () => `<@${targetUser.id}> has no tasks.`,
            NO_ACTIVE_TASKS: () => `<@${targetUser.id}> has no active tasks.`,
        });
    }
    const { member: profile, tasks: activeTasks } = active;

    const embed = new EmbedBuilder()
        .setTitle(`🎶 ${profile.username}'s Active Tasks ♪`)
        .setDescription("Here are all the wonderful things you're working on! Keep up the great work~ ✨")
        .setColor(0x39c5bb);

    for (const task of activeTasks) {
        const ts = Math.round(new Date(task.deadline).getTime() / 1000);
        const extStatus = task.hasExtended ? ' [Extended]' : '';
        const lateStatus = task.status === 'LATE' ? ' ⚠️ [LATE]' : '';
        const title = taskTitle(task);

        const deadlineText = profile.isOnHiatus ? 'N/A (On Hiatus)' : `<t:${ts}:F> (<t:${ts}:R>)`;
        let fieldValue = `**Type:** ${task.taskType}\n**Role:** ${task.roleName || 'N/A'}\n**Deadline:** ${deadlineText}${extStatus}${lateStatus}`;

        if (task.description) {
            fieldValue += `\n**Description:** ${task.description}`;
        }

        embed.addFields({ name: title, value: fieldValue, inline: false });
    }

    return { embeds: [embed] };
};

const coreHistory = async (filters = {}, page = 0) => {
    const {
        tasks: pageTasks,
        page: currentPage,
        totalPages,
        total,
    } = await assignmentService.historyPage(filters, page);

    if (total === 0) {
        return { content: 'No tasks found matching the criteria.', components: [] };
    }

    const embed = new EmbedBuilder()
        .setTitle('📚 Task History ♪')
        .setColor(0x39c5bb)
        .setFooter({ text: `🎵 Page ${currentPage + 1}/${totalPages} | Total: ${total} amazing task(s)!` })
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
        const statusIcon =
            task.status === 'COMPLETED'
                ? '\u2705'
                : task.status === 'PENDING'
                  ? '\ud83d\uddd2\ufe0f'
                  : task.status === 'LATE'
                    ? '\u274c'
                    : '\u2139\ufe0f';
        const title = `${statusIcon} ${taskTitle(task)}`;
        const username = task.member?.username || 'Unknown';
        const assignedDate = new Date(task.assignedAt).toLocaleString();
        const deadlineTs = Math.round(new Date(task.deadline).getTime() / 1000);
        const extStatus = task.hasExtended ? ' [Extended]' : '';

        let fieldValue = `**User:** ${username}\n**Role:** ${task.roleName}\n**Type:** ${task.taskType}\n**Status:** ${task.status}${extStatus}\n**Assigned:** ${assignedDate}\n**Deadline:** <t:${deadlineTs}:F>`;

        if (task.description) {
            fieldValue += `\n**Description:** ${task.description}`;
        }

        embed.addFields({ name: title, value: fieldValue, inline: false });
    }

    return { embeds: [embed], page: currentPage, totalPages: totalPages, filters: filters };
};

const coreHelp = async () => {
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

const coreHiatus = async (guild, author, targetUser, reason, channelId = null, isDirect = false) => {
    if (!reason) {
        return { content: '⚠️ Please provide a reason for the hiatus request.' };
    }

    if (isDirect) {
        const { pausedCount } = await hiatusService.start(targetUser.id);

        await logAction(
            guild,
            `🏖️ Hiatus granted directly to <@${targetUser.id}> by <@${author.id}>. All ${pausedCount} pending task(s) paused.`,
            author,
        );

        if (channelId) {
            const channel = guild.channels.cache.get(channelId);
            if (channel) {
                channel.send(
                    `🌸 <@${targetUser.id}> You've been granted hiatus! All your tasks are paused. Take the time you need and come back when you're ready~ ♪`,
                );
            }
        }

        return {
            content: `✅ Hiatus granted to <@${targetUser.id}>! All ${pausedCount} pending task(s) have been paused.`,
        };
    }

    const embed = new EmbedBuilder()
        .setTitle('🏖️ Hiatus Request ♪')
        .setColor(0x39c5bb)
        .setDescription(`<@${targetUser.id}> needs to take a little break. Taking care of yourself is important! 💖`)
        .addFields(
            { name: 'User', value: `<@${targetUser.id}>`, inline: true },
            { name: 'Username', value: targetUser.tag, inline: true },
            { name: 'Reason', value: reason, inline: false },
        )
        .setTimestamp();

    // The approval handler reads the channel id back out of this footer to know
    // where to notify the requester. Only set it when there is one - discord.js
    // rejects a null footer text.
    if (channelId) {
        embed.setFooter({ text: `Channel: ${channelId}` });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`hiatus_approve_${targetUser.id}`)
            .setLabel('Approve')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`hiatus_deny_${targetUser.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger),
    );

    const approvalChannel = guild.channels.cache.get(config.APPROVAL_CHANNEL_ID);
    if (approvalChannel) {
        await approvalChannel.send({ embeds: [embed], components: [row] });
    }

    return { content: `✅ Your hiatus request has been sent for review! I hope everything is okay~ ♪` };
};

const coreHiatusEnd = async (guild, author, targetUser) => {
    let ended;
    try {
        ended = await hiatusService.end(targetUser.id);
    } catch (error) {
        return refusalFor(error, {
            MEMBER_NOT_FOUND: () => '❌ User not found.',
            NOT_ON_HIATUS: () =>
                `⚠️ <@${targetUser.id}> is not currently on hiatus, so there are no paused deadlines to restore.`,
        });
    }
    const { restored, skipped } = ended;

    if (restored.length === 0 && skipped.length === 0) {
        await logAction(guild, `🌸 Welcome back! Ended hiatus for <@${targetUser.id}>`, author);
        return { content: `✅ Hiatus ended for <@${targetUser.id}>.` };
    }

    await logAction(
        guild,
        `🌸 Welcome back! Ended hiatus for <@${targetUser.id}> - restored ${restored.length} task(s)` +
            (skipped.length ? `, ${skipped.length} need a manual deadline` : ''),
        author,
    );

    let content = `✅ Hiatus ended for <@${targetUser.id}>.\n⏰ Set new deadlines for ${restored.length} task(s) based on their task types. Welcome back! ♪`;
    if (skipped.length) {
        content += `\n\n⚠️ These task(s) have no configured duration and are still paused — please set their deadlines manually with a new assignment:\n${skipped.map((name) => `• **${name}**`).join('\n')}`;
    }
    return { content };
};

export const handleAssignSlash = async (interaction) => {
    await interaction.deferReply();
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOwner(member)) {
        return interaction.editReply({
            content: 'Sorry, but only owners can assign tasks! If you need something assigned, reach out to them~ ♪',
        });
    }
    const result = await coreAssign(interaction.guild, interaction.user, interaction.options.getUser('user'), {
        taskType: interaction.options.getString('task'),
        roleName: interaction.options.getString('role'),
        taskName: interaction.options.getString('name') || '',
        description: interaction.options.getString('description') || '',
        durationDays: interaction.options.getInteger('duration_days'),
        extensionDays: interaction.options.getInteger('extension_days'),
    });
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
        return interaction.editReply({
            content: 'Looks like this user needs to be onboarded first! Ask an owner to help~ ♪',
        });
    }

    const taskName = interaction.options.getString('task') || '';
    const result = await coreSubmit(interaction.guild, {
        discordId: user.id,
        taskName,
        channelId: interaction.channelId,
    });
    return interaction.editReply(result);
};

export const handleExtensionSlash = async (interaction) => {
    await interaction.deferReply();
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const user = interaction.options.getUser('user') || interaction.user;

    if (user.id !== interaction.user.id && !isOwner(member)) {
        console.log('Is Owner:', isOwner(member));
        return interaction.editReply({
            content:
                'You can only request extensions for your own tasks! If someone else needs help, they should ask directly~ ♪',
        });
    }

    if (!(await isOnboarded(user.id))) {
        return interaction.editReply({
            content: 'Looks like this user needs to be onboarded first! Ask an owner to help~ ♪',
        });
    }

    const taskName = interaction.options.getString('task') || '';
    const reason = interaction.options.getString('reason') || '';
    const result = await coreExtension(interaction.guild, {
        discordId: user.id,
        taskName,
        reason,
        channelId: interaction.channelId,
    });
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
        return interaction.editReply({
            content:
                "Strike management is handled by managers and owners! If there's an issue, please reach out to them~ ♪",
        });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'list') {
        const result = await coreStrikeList(interaction.guild, interaction.user);
        return interaction.editReply(result);
    }

    const result = await coreStrike(
        interaction.guild,
        interaction.user,
        interaction.options.getUser('user'),
        subcommand,
        interaction.options.getString('reason'),
    );
    return interaction.editReply(result);
};

export const handleOnboardSlash = async (interaction) => {
    await interaction.deferReply();
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOwner(member)) {
        return interaction.editReply({
            content:
                'Only owners can onboard new users! If someone needs to join, ask an owner to help them get started~ ♪',
        });
    }
    const result = await coreOnboard(interaction.guild, interaction.user, interaction.options.getUser('user'));
    return interaction.editReply(result);
};

export const handleDeboardSlash = async (interaction) => {
    await interaction.deferReply();
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOwner(member)) {
        return interaction.editReply({
            content: 'Only owners can deboard users. If someone needs to take a break, ask an owner to help~ ♪',
        });
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
        return interaction.editReply({
            content:
                'Only managers and owners can remove tasks! If a task needs to be removed, ask an owner or manager~ ♪',
        });
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

    if (targetUser && targetUser.id !== interaction.user.id) {
        if (!isOwner(member)) {
            return interaction.editReply({
                content:
                    'Only owners can grant hiatus directly to other users! Normal users can request their own hiatus~ ♪',
            });
        }

        if (!(await isOnboarded(targetUser.id))) {
            return interaction.editReply({
                content: 'Looks like this user needs to be onboarded first! Ask an owner to help~ ♪',
            });
        }

        const result = await coreHiatus(
            interaction.guild,
            interaction.user,
            targetUser,
            reason,
            interaction.channelId,
            true,
        );
        return interaction.editReply(result);
    }

    if (!(await isOnboarded(interaction.user.id))) {
        return interaction.editReply({
            content: 'You need to be onboarded before requesting a hiatus! Talk to an owner to get started~ ♪',
        });
    }

    const result = await coreHiatus(
        interaction.guild,
        interaction.user,
        interaction.user,
        reason,
        interaction.channelId,
        false,
    );
    return interaction.editReply(result);
};

export const handleEndHiatusSlash = async (interaction) => {
    await interaction.deferReply();
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const targetUser = interaction.options.getUser('user') || interaction.user;

    if (targetUser.id !== interaction.user.id && !isOwner(member)) {
        return interaction.editReply({
            content:
                'You can only end your own hiatus! If someone else is ready to return, they should let us know themselves~ ♪',
        });
    }

    if (!(await isOnboarded(targetUser.id))) {
        return interaction.editReply({
            content: 'Looks like this user needs to be onboarded first! Ask an owner to help~ ♪',
        });
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
        roleName: roleName,
    };

    const result = await coreHistory(filters, 0);

    if (result.totalPages > 1) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('history_prev')
                .setLabel('Previous')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
            new ButtonBuilder().setCustomId('history_next').setLabel('Next').setStyle(ButtonStyle.Primary),
        );

        const response = await interaction.editReply({ embeds: result.embeds, components: [row], fetchReply: true });

        // Without a filter any member could page through someone else's embed,
        // and they would all share one page counter.
        const collector = response.createMessageComponentCollector({
            time: 300000,
            filter: (i) => i.user.id === interaction.user.id,
        });
        let currentPage = 0;

        collector.on('collect', async (i) => {
            await i.deferUpdate();
            if (i.customId === 'history_prev') currentPage = Math.max(0, currentPage - 1);
            if (i.customId === 'history_next') currentPage = Math.min(result.totalPages - 1, currentPage + 1);
            // re-read below from newResult so added/removed tasks are reflected

            const newResult = await coreHistory(filters, currentPage);

            const newRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('history_prev')
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(currentPage === 0),
                new ButtonBuilder()
                    .setCustomId('history_next')
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(currentPage >= newResult.totalPages - 1),
            );

            await i.editReply({ embeds: newResult.embeds, components: [newRow] });
        });

        collector.on('end', () => {
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('history_prev')
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('history_next')
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
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
            const userStatus = await memberService.availability(targetUser.id);

            const embed = new EmbedBuilder()
                .setTitle(`🎵 Availability Check: ${targetUser.username}`)
                .setColor(userStatus.isFree ? 0x39c5bb : 0xff5555)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setTimestamp();

            const statusEmoji = userStatus.isFree ? '✨' : '🔥';
            const statusText = userStatus.isFree ? '**FREE**' : '**BUSY**';

            let description = `${statusEmoji} Current Status: ${statusText}`;
            if (userStatus.isOnHiatus) description += ` (On Hiatus 🏝️)`;

            embed.setDescription(description);

            if (!userStatus.isFree && userStatus.activeTask) {
                embed.addFields({
                    name: 'Current Task',
                    value: `**${taskTitle(userStatus.activeTask)}**\nRole: ${userStatus.activeTask.roleName}\nDeadline: <t:${Math.floor(new Date(userStatus.activeTask.deadline).getTime() / 1000)}:R>`,
                    inline: false,
                });
            } else if (userStatus.isFree) {
                embed.addFields({
                    name: 'Ready for work?',
                    value: userStatus.isOnHiatus
                        ? 'Checking in on hiatus! Take your time~'
                        : 'Ready to take on a new challenge! ♪',
                    inline: false,
                });
            }

            if (userStatus.lastTask) {
                // completedAt is null for tasks finished before the field
                // existed - say so rather than showing the deadline and
                // labelling it "Completed".
                const finishedAt = userStatus.lastTask.completedAt;
                const whenLine = finishedAt
                    ? `Completed: <t:${Math.floor(new Date(finishedAt).getTime() / 1000)}:d>`
                    : `Was due: <t:${Math.floor(new Date(userStatus.lastTask.deadline).getTime() / 1000)}:d>`;

                embed.addFields({
                    name: 'Last Completed Task',
                    value: `**${taskTitle(userStatus.lastTask)}**\n${whenLine}`,
                    inline: false,
                });
            } else {
                embed.addFields({ name: 'History', value: 'No completed tasks yet. A fresh start!', inline: false });
            }

            embed.setFooter({
                text: userStatus.isFree ? "Let's assign something fun! 💫" : 'Gambare! You can do it! ♪',
            });
            return { embeds: [embed] };
        } else {
            const { active: activeFree, onHiatus: hiatusFree } = await memberService.freeMembers();

            if (activeFree.length === 0 && hiatusFree.length === 0) {
                return {
                    content: 'Everyone seems to be busy with their tasks right now! Just like hard-working idols! ♪',
                };
            }

            const embed = new EmbedBuilder()
                .setTitle('🎵 Available Users')
                .setColor(0x39c5bb)
                .setDescription('Here are the users with no active tasks~ Time to make some music! 🎤')
                .setTimestamp();

            if (activeFree.length > 0) {
                const activeList = activeFree.map((u) => {
                    const lastTaskInfo = u.lastTask ? `Last: *${taskTitle(u.lastTask)}*` : 'No prior tasks';
                    return `• <@${u.discordId}> - ${lastTaskInfo}`;
                });

                // Embed field value limit is 1024 characters.
                // We'll create multiple fields if the list is too long.
                const chunks = [];
                let currentChunk = '';

                for (const line of activeList) {
                    if ((currentChunk + line + '\n').length > 1024) {
                        chunks.push(currentChunk);
                        currentChunk = line + '\n';
                    } else {
                        currentChunk += line + '\n';
                    }
                }
                if (currentChunk) chunks.push(currentChunk);

                chunks.forEach((chunk, index) => {
                    embed.addFields({
                        name: index === 0 ? '✨ Ready for Assignment' : '✨ Ready for Assignment (Cont.)',
                        value: chunk,
                        inline: false,
                    });
                });
            }

            if (hiatusFree.length > 0) {
                const hiatusList = hiatusFree.map((u) => {
                    const lastTaskInfo = u.lastTask ? `Last: *${taskTitle(u.lastTask)}*` : 'No prior tasks';
                    return `• <@${u.discordId}> - ${lastTaskInfo}`;
                });

                const chunks = [];
                let currentChunk = '';

                for (const line of hiatusList) {
                    if ((currentChunk + line + '\n').length > 1024) {
                        chunks.push(currentChunk);
                        currentChunk = line + '\n';
                    } else {
                        currentChunk += line + '\n';
                    }
                }
                if (currentChunk) chunks.push(currentChunk);

                chunks.forEach((chunk, index) => {
                    embed.addFields({
                        name: index === 0 ? '🏝️ On Hiatus (Free)' : '🏝️ On Hiatus (Free) (Cont.)',
                        value: chunk,
                        inline: false,
                    });
                });
            }

            embed.setFooter({ text: "Let's create something amazing together! 💫" });

            return { embeds: [embed] };
        }
    } catch (error) {
        if (error.code === 'MEMBER_NOT_FOUND') {
            return {
                content: `I couldn't find any profile for <@${targetUser.id}>. Maybe they haven't joined the team yet?`,
            };
        }
        console.error('Error in coreCheckFree:', error);
        return { content: 'O-Oh no! Something went wrong while checking for available users... 😢' };
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
            {
                name: 'Status',
                value: latency < 200 ? '✨ Excellent!' : latency < 400 ? '👍 Good!' : '⚠️ A bit slow...',
                inline: true,
            },
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
            { name: 'Status', value: '💚 Running strong!', inline: false },
        )
        .setFooter({ text: "Always here to support everyone's creative journey!" })
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

const submitPicked = async (interaction, discordId, taskId) => {
    try {
        const { task } = await submissionService.request({ discordId, taskId, channelId: interaction.channelId });
        await sendForReview(interaction.guild, discordId, task);
        return true;
    } catch (error) {
        refusalFor(error, SUBMIT_REFUSALS);
        return false;
    }
};

export const handleSelectSubmit = async (interaction) => {
    const targetUserId = interaction.customId.split('_')[2];

    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (interaction.user.id !== targetUserId && !isOwner(member)) {
        return interaction.reply({
            content: 'I appreciate the help, but you can only submit your own tasks! ♪',
            flags: 64,
        });
    }

    await interaction.deferUpdate();

    let successCount = 0;
    for (const taskId of interaction.values) {
        const sent = await submitPicked(interaction, targetUserId, taskId);
        if (sent) successCount++;
    }

    return interaction.editReply({
        content: `✅ Successfully sent ${successCount} task(s) for review! Keep up the amazing work~ ♪`,
        embeds: [],
        components: [],
    });
};

export const bulkAssignCache = new Map();

export const handleBulkAssignSlash = async (interaction) => {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isOwner(member)) {
        return interaction.reply({ content: 'Only owners can assign tasks! ♪', flags: 64 });
    }

    const roleName = interaction.options.getString('role');
    const taskType = interaction.options.getString('task');
    const taskName = interaction.options.getString('name') || '';
    const description = interaction.options.getString('description') || '';
    const durationDays = interaction.options.getInteger('duration_days') || null;
    const extensionDays = interaction.options.getInteger('extension_days') || null;

    const operationId = Date.now().toString() + Math.floor(Math.random() * 1000).toString();

    bulkAssignCache.set(operationId, {
        authorId: interaction.user.id,
        request: { roleName, taskType, taskName, description, durationDays, extensionDays },
    });

    setTimeout(() => {
        bulkAssignCache.delete(operationId);
    }, 15 * MINUTE);

    const select = new UserSelectMenuBuilder()
        .setCustomId(`bulkassign_select_${operationId}`)
        .setPlaceholder('Select users to assign this task to...')
        .setMinValues(1)
        .setMaxValues(25);

    const row = new ActionRowBuilder().addComponents(select);

    await interaction.reply({
        content: `✨ **Bulk Assigning: ${taskType} (${roleName})**\nPlease select up to 25 users to assign this task to:`,
        components: [row],
        flags: 64,
    });
};

export const handleBulkAssignSelect = async (interaction) => {
    await interaction.deferUpdate();

    const operationId = interaction.customId.replace('bulkassign_select_', '');
    const data = bulkAssignCache.get(operationId);

    if (!data) {
        return interaction.editReply({
            content: '⚠️ This bulk assign session has expired. Please try again.',
            components: [],
        });
    }

    if (interaction.user.id !== data.authorId) {
        return interaction.editReply({ content: 'You cannot use this menu.', components: [] });
    }

    const selectedUsers = interaction.users;
    if (selectedUsers.size === 0) {
        return interaction.editReply({ content: 'No users selected.', components: [] });
    }

    const successUsers = [];
    const failedUsers = [];

    for (const [, user] of selectedUsers) {
        try {
            await assignTo(interaction.guild, user, data.request);
            successUsers.push(user);
            user.send(
                `✨ **You've been assigned a new task!**\n**Type:** ${data.request.taskType}\n**Role:** ${data.request.roleName}${data.request.taskName ? `\n**Name:** ${data.request.taskName}` : ''}${data.request.description ? `\n**Description:** ${data.request.description}` : ''}\nLet's do our best! ♪`,
            ).catch(() => {});
        } catch (error) {
            failedUsers.push({ user, reason: refusalFor(error, ASSIGN_REFUSALS).content });
        }
    }

    bulkAssignCache.delete(operationId);

    let replyContent = `✅ **Bulk Assign Complete!**\n\nSuccessfully assigned to ${successUsers.length} user(s).`;
    if (successUsers.length > 0) {
        const mentions = successUsers.map((u) => `<@${u.id}>`).join(', ');
        await logAction(
            interaction.guild,
            `✨ **Bulk Assigned ${data.request.taskType} (${data.request.roleName})** to: ${mentions}`,
            interaction.user,
        );
    }

    if (failedUsers.length > 0) {
        replyContent +=
            `\n\n⚠️ **Failed for ${failedUsers.length} user(s):**\n` +
            failedUsers.map((f) => `• <@${f.user.id}>: ${f.reason}`).join('\n');
    }

    await interaction.editReply({ content: replyContent, components: [] });
};
