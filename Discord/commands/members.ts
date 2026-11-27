import { memberService, strikeService } from '../../Services/index.ts';
import { guardCommand } from '../guard.ts';
import { checkDemotion, logAction } from '../notifier.ts';
import type { CommandInteraction } from '../ports.ts';
import * as membership from '../views/members.ts';
import type { Reply } from '../views/permissions.ts';
import { refusalFor } from '../views/refusals.ts';
import * as strikes from '../views/strikes.ts';

const onboard = async (interaction: CommandInteraction) => {
    const target = interaction.options.getUser('user', true);
    const { status, strikes: count } = await memberService.onboard(target.id, target.username);
    if (status === 'existing') return membership.alreadyOnboarded(target.id, count);
    const restored = status === 'restored';
    const log = restored ? membership.restoredLog(target.id) : membership.welcomedLog(target.id);
    await logAction(interaction.guild, log, interaction.user);
    return restored ? membership.restored(target.id, count) : membership.welcomed(target.id, count);
};

export const handleOnboard = async (interaction: CommandInteraction) => {
    await interaction.deferReply();
    const refusal = await guardCommand(interaction, 'onboard');
    return interaction.editReply(refusal ?? (await onboard(interaction)));
};

const deboard = async (interaction: CommandInteraction) => {
    const target = interaction.options.getUser('user', true);
    let statusMessage;
    try {
        ({ statusMessage } = await memberService.deboard(target.id, interaction.options.getString('message')));
    } catch (error) {
        return refusalFor(error, membership.deboardRefusals(target.id));
    }
    await logAction(interaction.guild, membership.deboardedLog(target.id), interaction.user);
    return membership.deboarded(target.id, statusMessage);
};

export const handleDeboard = async (interaction: CommandInteraction) => {
    await interaction.deferReply();
    const refusal = await guardCommand(interaction, 'deboard');
    return interaction.editReply(refusal ?? (await deboard(interaction)));
};

const addStrike = async (interaction: CommandInteraction) => {
    const target = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason');
    const { strikes: count } = await strikeService.add({ discordId: target.id, username: target.username });
    await logAction(interaction.guild, strikes.strikeAddedLog(target.id, reason), interaction.user);
    await checkDemotion(interaction.guild, target.id, count);
    return strikes.strikeAdded(target.id, reason, count);
};

const removeStrike = async (interaction: CommandInteraction) => {
    const target = interaction.options.getUser('user', true);
    const { strikes: count } = await strikeService.remove({ discordId: target.id, username: target.username });
    await logAction(interaction.guild, strikes.strikeRemovedLog(target.id), interaction.user);
    return strikes.strikeRemoved(target.id, count);
};

const listStrikes = async () => {
    const members = await strikeService.list();
    return members.length === 0 ? strikes.NO_STRIKES : strikes.strikeList(members);
};

const STRIKE_ACTIONS: Partial<Record<string, (interaction: CommandInteraction) => Promise<Reply>>> = {
    add: addStrike,
    remove: removeStrike,
};

const changeStrikes = async (interaction: CommandInteraction, subcommand: string) => {
    const change = Object.hasOwn(STRIKE_ACTIONS, subcommand) ? STRIKE_ACTIONS[subcommand] : undefined;
    if (!change) return strikes.UNKNOWN_STRIKE_ACTION;
    try {
        return await change(interaction);
    } catch (error) {
        return refusalFor(error, strikes.strikeRefusals(interaction.options.getUser('user', true).id));
    }
};

export const handleStrike = async (interaction: CommandInteraction) => {
    await interaction.deferReply();
    const refusal = await guardCommand(interaction, 'strike');
    if (refusal) return interaction.editReply(refusal);
    const subcommand = interaction.options.getSubcommand();
    return interaction.editReply(
        subcommand === 'list' ? await listStrikes() : await changeStrikes(interaction, subcommand),
    );
};
