import { hiatusService } from '../../Services/index.ts';
import { guardCommand } from '../guard.ts';
import { logAction, notify, postForApproval } from '../notifier.ts';
import type { CommandInteraction, UserPort } from '../ports.ts';
import * as view from '../views/hiatus.ts';
import { refusalFor } from '../views/refusals.ts';

const grant = async (interaction: CommandInteraction, target: UserPort) => {
    const { pausedCount } = await hiatusService.start(target.id);
    await logAction(interaction.guild, view.grantedLog(target.id, interaction.user.id, pausedCount), interaction.user);
    notify(interaction.guild, interaction.channelId, view.grantedNotice(target.id));
    return view.granted(target.id, pausedCount);
};

const askForHiatus = async (interaction: CommandInteraction, reason: string) => {
    await postForApproval(interaction.guild, view.hiatusReview(interaction.user, reason, interaction.channelId));
    return view.REQUESTED;
};

const hiatus = async (interaction: CommandInteraction, target: UserPort) => {
    const reason = interaction.options.getString('reason');
    if (!reason) return view.REASON_MISSING;
    return target.id === interaction.user.id ? askForHiatus(interaction, reason) : grant(interaction, target);
};

export const handleHiatus = async (interaction: CommandInteraction) => {
    await interaction.deferReply();
    const target = interaction.options.getUser('user') || interaction.user;
    const refusal = await guardCommand(interaction, 'hiatus', target.id);
    return interaction.editReply(refusal ?? (await hiatus(interaction, target)));
};

const endHiatus = async (interaction: CommandInteraction, target: UserPort) => {
    let ended;
    try {
        ended = await hiatusService.end(target.id);
    } catch (error) {
        return refusalFor(error, view.endRefusals(target.id));
    }
    const { restored, skipped } = ended;
    await logAction(interaction.guild, view.endedLog(target.id, restored.length, skipped.length), interaction.user);
    return view.ended(target.id, restored.length, skipped);
};

export const handleEndHiatus = async (interaction: CommandInteraction) => {
    await interaction.deferReply();
    const target = interaction.options.getUser('user') || interaction.user;
    const refusal = await guardCommand(interaction, 'endhiatus', target.id);
    return interaction.editReply(refusal ?? (await endHiatus(interaction, target)));
};
