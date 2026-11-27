import { memberService } from '../../Services/index.ts';
import type { AvatarUser, CommandInteraction } from '../ports.ts';
import * as view from '../views/availability.ts';
import { isDomainError } from '../views/refusals.ts';

const checkMember = async (target: AvatarUser) =>
    view.memberAvailability(target, await memberService.availability(target.id));

const checkEveryone = async () => {
    const { active, onHiatus } = await memberService.freeMembers();
    return active.length === 0 && onHiatus.length === 0 ? view.EVERYONE_BUSY : view.freeMembers(active, onHiatus);
};

const checkFree = async (target: AvatarUser | null) => {
    try {
        return target ? await checkMember(target) : await checkEveryone();
    } catch (error) {
        if (target && isDomainError(error, 'MEMBER_NOT_FOUND')) return view.notFound(target.id);
        console.error('Error in coreCheckFree:', error);
        return view.AVAILABILITY_FAILED;
    }
};

export const handleCheckFree = async (interaction: CommandInteraction) => {
    await interaction.deferReply();
    return interaction.editReply(await checkFree(interaction.options.getUser('user')));
};
