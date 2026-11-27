import { submissionService } from '../../Services/index.ts';
import type { SubmissionOutcome } from '../../Services/submissionService.ts';
import { guardTaskPick } from '../guard.ts';
import { postForApproval } from '../notifier.ts';
import type { TaskPickInteraction } from '../ports.ts';
import { refusalFor } from '../views/refusals.ts';
import { picksSubmitted, SUBMIT_REFUSALS, submissionReview } from '../views/submission.ts';

export const TASK_PICK_PREFIX = 'submit_select_';

const submitPicked = async (interaction: TaskPickInteraction, discordId: string, taskId: string) => {
    try {
        const outcome = await submissionService.request({ discordId, taskId, channelId: interaction.channelId });
        const { task } = outcome as Extract<SubmissionOutcome, { kind: 'request' }>;
        await postForApproval(interaction.guild, submissionReview(discordId, task));
        return true;
    } catch (error) {
        refusalFor(error, SUBMIT_REFUSALS);
        return false;
    }
};

export const handleTaskPick = async (interaction: TaskPickInteraction) => {
    const [, , targetUserId = ''] = interaction.customId.split('_');
    const refusal = await guardTaskPick(interaction, targetUserId);
    if (refusal) return interaction.reply({ ...refusal, flags: 64 });

    await interaction.deferUpdate();
    let sent = 0;
    for (const taskId of interaction.values) {
        if (await submitPicked(interaction, targetUserId, taskId)) sent++;
    }
    return interaction.editReply(picksSubmitted(sent));
};
