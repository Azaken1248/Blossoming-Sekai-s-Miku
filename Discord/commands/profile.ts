import config from '../../config.js';
import { cardService, memberService } from '../../Services/index.ts';
import { crewRoleNames } from '../../Utils/domain/roles.ts';
import { roleIdsOf } from '../guard.ts';
import type { AvatarUser, CommandInteraction, GuildPort } from '../ports.ts';
import { CARD_FAILED, CARD_NOT_FOUND, deboardedCard, memberCard } from '../views/card.ts';
import { deboardedProfile, memberProfile, mikuProfile, PROFILE_REFUSALS } from '../views/profile.ts';
import { isDomainError, refusalFor } from '../views/refusals.ts';
import { activeTasks, tasksRefusals } from '../views/tasks.ts';

const MIKU_USER_ID = '1449394728863924354';

const targetOf = (interaction: CommandInteraction): AvatarUser =>
    interaction.options.getUser('user') || interaction.user;

const crewRolesOf = async (guild: GuildPort | null, discordId: string): Promise<string[]> => {
    if (!guild) return [];
    const member = await guild.members.fetch(discordId).catch(() => null);
    return member ? crewRoleNames(roleIdsOf(member), config.CREW_ROLE_IDS, config.RULES) : [];
};

const profile = async (target: AvatarUser, guild: GuildPort | null) => {
    if (target.id === MIKU_USER_ID) return mikuProfile(target);
    let summary;
    try {
        summary = await memberService.profile(target.id);
    } catch (error) {
        return refusalFor(error, PROFILE_REFUSALS);
    }
    if (summary.member.isDeboarded) return deboardedProfile(target, summary);
    return memberProfile(target, summary, await crewRolesOf(guild, target.id));
};

export const handleProfile = async (interaction: CommandInteraction) => {
    await interaction.deferReply();
    return interaction.editReply(await profile(targetOf(interaction), interaction.guild));
};

const card = async (target: AvatarUser) => {
    try {
        const found = await cardService.get(target.id);
        return found.kind === 'deboarded' ? deboardedCard(target, found.member) : memberCard(target, found.image);
    } catch (error) {
        if (isDomainError(error, 'CARD_NOT_FOUND')) return CARD_NOT_FOUND;
        console.error('Error fetching card data:', error);
        return CARD_FAILED;
    }
};

export const handleCard = async (interaction: CommandInteraction) => {
    await interaction.deferReply();
    return interaction.editReply(await card(targetOf(interaction)));
};

const tasks = async (target: AvatarUser) => {
    try {
        const { member, tasks: open } = await memberService.activeTasks(target.id);
        return activeTasks(member, open);
    } catch (error) {
        return refusalFor(error, tasksRefusals(target.id));
    }
};

export const handleTasks = async (interaction: CommandInteraction) => {
    await interaction.deferReply();
    return interaction.editReply(await tasks(targetOf(interaction)));
};
