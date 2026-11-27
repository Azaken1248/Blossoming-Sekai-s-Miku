import { extensionService, submissionService } from '../../Services/index.ts';
import { guardCommand } from '../guard.ts';
import { postForApproval } from '../notifier.ts';
import type { CommandInteraction } from '../ports.ts';
import { EXTENSION_REFUSALS, extensionRequested, extensionReview } from '../views/extension.ts';
import { isDomainError, refusalFor } from '../views/refusals.ts';
import { SUBMIT_REFUSALS, submissionReview, submitted, taskPicker } from '../views/submission.ts';

const targetOf = (interaction: CommandInteraction) => interaction.options.getUser('user') || interaction.user;

const submit = async (interaction: CommandInteraction, discordId: string) => {
    const taskName = interaction.options.getString('task') || '';
    let outcome;
    try {
        outcome = await submissionService.request({ discordId, taskName, channelId: interaction.channelId });
    } catch (error) {
        return refusalFor(error, SUBMIT_REFUSALS);
    }
    if (outcome.kind === 'choose') return taskPicker(discordId, outcome.tasks);
    await postForApproval(interaction.guild, submissionReview(discordId, outcome.task));
    return submitted(outcome.task);
};

export const handleSubmit = async (interaction: CommandInteraction) => {
    await interaction.deferReply();
    const target = targetOf(interaction);
    const refusal = await guardCommand(interaction, 'submit', target.id);
    return interaction.editReply(refusal ?? (await submit(interaction, target.id)));
};

const requestExtension = async (interaction: CommandInteraction, discordId: string) => {
    const taskName = interaction.options.getString('task') || '';
    const reason = interaction.options.getString('reason') || '';
    let outcome;
    try {
        outcome = await extensionService.request({ discordId, taskName, reason, channelId: interaction.channelId });
    } catch (error) {
        if (isDomainError(error, 'CONFIG_MISSING_ROLE')) {
            console.error('[EXTENSION] Configuration problem:', (error as Error).message);
        }
        return refusalFor(error, EXTENSION_REFUSALS);
    }
    const { task, extensionMs } = outcome;
    await postForApproval(interaction.guild, extensionReview(discordId, task, extensionMs, reason));
    return extensionRequested(task);
};

export const handleExtension = async (interaction: CommandInteraction) => {
    await interaction.deferReply();
    const target = targetOf(interaction);
    const refusal = await guardCommand(interaction, 'extension', target.id);
    return interaction.editReply(refusal ?? (await requestExtension(interaction, target.id)));
};
