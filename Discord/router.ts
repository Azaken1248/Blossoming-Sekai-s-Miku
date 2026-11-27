import { type CommandName, isCommandName } from '../Utils/permissions.ts';
import { handleAssign, handleBulkAssign, handleRemoveTask } from './commands/assignment.ts';
import { handleCheckFree } from './commands/availability.ts';
import { handleEndHiatus, handleHiatus } from './commands/hiatus.ts';
import { handleHistory } from './commands/history.ts';
import { handleDeboard, handleOnboard, handleStrike } from './commands/members.ts';
import { handleCard, handleProfile, handleTasks } from './commands/profile.ts';
import { handleHelp, handlePing, handleUptime } from './commands/status.ts';
import { handleExtension, handleSubmit } from './commands/submission.ts';
import { handleApprovalButton, ownsButton } from './components/approvals.ts';
import { BULK_ASSIGN_PREFIX, handleBulkAssignPick } from './components/bulkAssign.ts';
import { handleTaskPick, TASK_PICK_PREFIX } from './components/taskPick.ts';
import type {
    ButtonInteraction,
    CommandInteraction,
    ComponentInteraction,
    PeoplePickInteraction,
    TaskPickInteraction,
} from './ports.ts';
import { COMMAND_FAILED, COMPONENT_FAILED } from './views/errors.ts';

type CommandHandler = (interaction: CommandInteraction) => Promise<unknown>;

export const COMMANDS: Readonly<Record<CommandName, CommandHandler>> = {
    assign: handleAssign,
    bulkassign: handleBulkAssign,
    tasks: handleTasks,
    submit: handleSubmit,
    extension: handleExtension,
    profile: handleProfile,
    card: handleCard,
    strike: handleStrike,
    onboard: handleOnboard,
    deboard: handleDeboard,
    removetask: handleRemoveTask,
    hiatus: handleHiatus,
    endhiatus: handleEndHiatus,
    history: handleHistory,
    checkfree: handleCheckFree,
    help: handleHelp,
    ping: handlePing,
    uptime: handleUptime,
};

export interface IncomingInteraction {
    isChatInputCommand(): this is CommandInteraction;
    isButton(): this is ButtonInteraction;
    isStringSelectMenu(): this is TaskPickInteraction;
    isUserSelectMenu(): this is PeoplePickInteraction;
}

const reportCommandFailure = async (interaction: CommandInteraction) => {
    try {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(COMMAND_FAILED);
        } else {
            await interaction.reply({ ...COMMAND_FAILED, flags: 64 });
        }
    } catch (replyError) {
        console.error(`[COMMAND] ❌ Could not report the error to the user:`, replyError);
    }
};

export const routeCommand = async (interaction: CommandInteraction): Promise<void> => {
    const { commandName } = interaction;
    console.log(`[COMMAND] /${commandName} by ${interaction.user.tag} (${interaction.user.id})`);
    try {
        await (isCommandName(commandName) ? COMMANDS[commandName] : undefined)?.(interaction);
        console.log(`[COMMAND] ✅ /${commandName} completed successfully`);
    } catch (e) {
        console.error(`[COMMAND] ❌ Error in /${commandName}:`, e);
        await reportCommandFailure(interaction);
    }
};

const reportComponentFailure = (interaction: ComponentInteraction) => {
    if (!interaction.replied && !interaction.deferred) {
        void interaction.reply({ ...COMPONENT_FAILED, flags: 64 });
    } else if (interaction.deferred) {
        void interaction.editReply(COMPONENT_FAILED);
    }
};

const routePick = async <Pick extends ComponentInteraction>(
    interaction: Pick,
    tag: string,
    prefix: string,
    handle: (interaction: Pick) => Promise<unknown>,
): Promise<void> => {
    try {
        if (interaction.customId.startsWith(prefix)) {
            console.log(`[${tag}] ${interaction.customId} by ${interaction.user.tag} (${interaction.user.id})`);
            await handle(interaction);
        }
    } catch (e) {
        console.error(`[${tag}] ❌ Error processing ${interaction.customId}:`, e);
        reportComponentFailure(interaction);
    }
};

export const routeInteraction = async (interaction: IncomingInteraction): Promise<void> => {
    if (interaction.isChatInputCommand()) await routeCommand(interaction);
    if (interaction.isButton() && ownsButton(interaction.customId)) await handleApprovalButton(interaction);
    if (interaction.isStringSelectMenu()) await routePick(interaction, 'SELECT', TASK_PICK_PREFIX, handleTaskPick);
    if (interaction.isUserSelectMenu()) {
        await routePick(interaction, 'USER_SELECT', BULK_ASSIGN_PREFIX, handleBulkAssignPick);
    }
};
