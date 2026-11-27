import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import type { Member } from '../../Utils/domain/model.ts';
import type { AvatarUser } from '../ports.ts';
import { localDate } from './format.ts';

export const deboardedCard = (user: AvatarUser, member: Member) => ({
    embeds: [
        new EmbedBuilder()
            .setTitle(`✨ ${member.deboardedMessage}`)
            .setColor(0xb9e2f0)
            .setDescription('This member has completed their journey in the SEKAI~ 🌸')
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setFooter({ text: `Deboarded: ${localDate(member.deboardedAt)}` })
            .setTimestamp(),
    ],
});

export const memberCard = (user: AvatarUser, image: Buffer) => ({
    embeds: [
        new EmbedBuilder()
            .setTitle(`Card for ${user.username}`)
            .setColor(0x39c5bb)
            .setImage('attachment://card.png')
            .setFooter({ text: `ID: ${user.id}` })
            .setTimestamp(),
    ],
    files: [new AttachmentBuilder(image, { name: 'card.png' })],
});

export const CARD_NOT_FOUND = { content: 'Card not found. Have you joined the Sekai?' };
export const CARD_FAILED = { content: 'Failed to load card. Please try again.' };
