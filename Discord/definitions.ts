import { SlashCommandBuilder } from 'discord.js';
import config from '../config.js';
import { MAX_SEARCH_LENGTH } from '../Utils/domain/search.ts';

interface ChoiceRule {
    readonly name: string;
    readonly tasks?: Readonly<Record<string, number>>;
}

const RULES: Readonly<Record<string, ChoiceRule>> = config.RULES;

const formatChoice = (str: string): string => {
    return str.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
};

const getRoleChoices = () => {
    return Object.values(RULES).map((rule) => ({
        name: formatChoice(rule.name === 'BOT DEV' ? 'Bot Dev' : rule.name),
        value: rule.name,
    }));
};

const getTaskChoices = () => {
    const allTasks = new Set<string>();
    Object.values(RULES).forEach((rule) => {
        if (rule.tasks) Object.keys(rule.tasks).forEach((task) => allTasks.add(task));
    });
    allTasks.add('custom');

    return Array.from(allTasks).map((task) => ({
        name: formatChoice(task),
        value: task,
    }));
};

export const COMMAND_DEFINITIONS = [
    new SlashCommandBuilder()
        .setName('assign')
        .setDescription('Assign task')
        .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
        .addStringOption((o) =>
            o
                .setName('role')
                .setDescription('Role')
                .setRequired(true)
                .addChoices(...getRoleChoices()),
        )
        .addStringOption((o) =>
            o
                .setName('task')
                .setDescription('Task type')
                .setRequired(true)
                .addChoices(...getTaskChoices()),
        )
        .addStringOption((o) => o.setName('name').setDescription('Task name').setRequired(false))
        .addStringOption((o) => o.setName('description').setDescription('Task description').setRequired(false))
        .addIntegerOption((o) =>
            o
                .setName('duration_days')
                .setDescription('Duration in days (ONLY for Custom tasks)')
                .setRequired(false)
                .setMinValue(1),
        )
        .addIntegerOption((o) =>
            o
                .setName('extension_days')
                .setDescription('Extension days (ONLY for Custom tasks)')
                .setRequired(false)
                .setMinValue(1),
        ),
    new SlashCommandBuilder()
        .setName('bulkassign')
        .setDescription('Assign task to multiple users')
        .addStringOption((o) =>
            o
                .setName('role')
                .setDescription('Role')
                .setRequired(true)
                .addChoices(...getRoleChoices()),
        )
        .addStringOption((o) =>
            o
                .setName('task')
                .setDescription('Task type')
                .setRequired(true)
                .addChoices(...getTaskChoices()),
        )
        .addStringOption((o) => o.setName('name').setDescription('Task name').setRequired(false))
        .addStringOption((o) => o.setName('description').setDescription('Task description').setRequired(false))
        .addIntegerOption((o) =>
            o
                .setName('duration_days')
                .setDescription('Duration in days (ONLY for Custom tasks)')
                .setRequired(false)
                .setMinValue(1),
        )
        .addIntegerOption((o) =>
            o
                .setName('extension_days')
                .setDescription('Extension days (ONLY for Custom tasks)')
                .setRequired(false)
                .setMinValue(1),
        ),
    new SlashCommandBuilder()
        .setName('submit')
        .setDescription('Complete task')
        .addUserOption((o) => o.setName('user').setDescription('User').setRequired(false))
        .addStringOption((o) =>
            o.setName('task').setDescription('Task name (use /tasks to see list)').setRequired(false),
        ),
    new SlashCommandBuilder()
        .setName('extension')
        .setDescription('Request extension')
        .addStringOption((o) => o.setName('reason').setDescription('Reason for extension').setRequired(true))
        .addUserOption((o) => o.setName('user').setDescription('User').setRequired(false))
        .addStringOption((o) => o.setName('task').setDescription('Task name').setRequired(false)),
    new SlashCommandBuilder()
        .setName('profile')
        .setDescription('View profile')
        .addUserOption((o) => o.setName('user').setDescription('User').setRequired(false)),
    new SlashCommandBuilder()
        .setName('card')
        .setDescription('View ID card (like the website card)')
        .addUserOption((o) =>
            o.setName('user').setDescription('User (leave blank for your own card)').setRequired(false),
        ),
    new SlashCommandBuilder()
        .setName('strike')
        .setDescription('Manage strikes')
        .addSubcommand((s) => s.setName('list').setDescription('List all users with strikes'))
        .addSubcommand((s) =>
            s
                .setName('add')
                .setDescription('Add Strike')
                .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
                .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true)),
        )
        .addSubcommand((s) =>
            s
                .setName('remove')
                .setDescription('Remove Strike')
                .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)),
        ),
    new SlashCommandBuilder()
        .setName('onboard')
        .setDescription('Onboard a new user')
        .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)),
    new SlashCommandBuilder()
        .setName('deboard')
        .setDescription('Safely deboard a user')
        .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
        .addStringOption((o) =>
            o.setName('message').setDescription('Custom deboard message (optional)').setRequired(false),
        ),
    new SlashCommandBuilder()
        .setName('removetask')
        .setDescription('Remove a task from a user (admins/owners only)')
        .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
        .addStringOption((o) => o.setName('task').setDescription('Task name or type').setRequired(true)),
    new SlashCommandBuilder()
        .setName('hiatus')
        .setDescription('Request or grant hiatus')
        .addStringOption((o) => o.setName('reason').setDescription('Reason for hiatus').setRequired(true))
        .addUserOption((o) =>
            o.setName('user').setDescription('User (owners only - grants directly)').setRequired(false),
        ),
    new SlashCommandBuilder()
        .setName('endhiatus')
        .setDescription('End hiatus (leave blank to end your own)')
        .addUserOption((o) => o.setName('user').setDescription('User (optional)').setRequired(false)),
    new SlashCommandBuilder()
        .setName('tasks')
        .setDescription('View detailed tasks')
        .addUserOption((o) => o.setName('user').setDescription('User').setRequired(false)),
    new SlashCommandBuilder()
        .setName('history')
        .setDescription('View task history')
        .addUserOption((o) => o.setName('user').setDescription('Filter by user').setRequired(false))
        .addStringOption((o) =>
            o.setName('task').setDescription('Filter by task name').setRequired(false).setMaxLength(MAX_SEARCH_LENGTH),
        )
        .addStringOption((o) =>
            o
                .setName('status')
                .setDescription('Filter by status')
                .addChoices(
                    { name: 'Pending', value: 'PENDING' },
                    { name: 'Completed', value: 'COMPLETED' },
                    { name: 'Late', value: 'LATE' },
                    { name: 'Excused', value: 'EXCUSED' },
                )
                .setRequired(false),
        )
        .addStringOption((o) =>
            o.setName('role').setDescription('Filter by role name').setRequired(false).setMaxLength(MAX_SEARCH_LENGTH),
        ),
    new SlashCommandBuilder()
        .setName('checkfree')
        .setDescription('Check who has no active tasks or check a specific user')
        .addUserOption((o) => o.setName('user').setDescription('Check a specific user').setRequired(false)),
    new SlashCommandBuilder().setName('help').setDescription('Show all available commands'),
    new SlashCommandBuilder().setName('ping').setDescription('Check bot response time'),
    new SlashCommandBuilder().setName('uptime').setDescription('Check how long the bot has been running'),
].map((c) => c.toJSON());
