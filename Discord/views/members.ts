import { formatStrikes } from '../../Utils/domain/strikes.ts';
import type { Reply } from './permissions.ts';
import type { Wording } from './refusals.ts';

export const restoredLog = (targetId: string): string => `🌸 Re-onboarded <@${targetId}> - welcome back!`;

export const restored = (targetId: string, strikes: number): Reply => ({
    content: `🌸 Welcome back to our SEKAI, <@${targetId}>! Your record has been restored~ ♪\nStrikes: **${formatStrikes(strikes)}**`,
});

export const alreadyOnboarded = (targetId: string, strikes: number): Reply => ({
    content: `✨ <@${targetId}> is already part of our SEKAI!\nStrikes: **${formatStrikes(strikes)}**`,
});

export const welcomedLog = (targetId: string): string => `🎉 Welcomed <@${targetId}> to our SEKAI!`;

export const welcomed = (targetId: string, strikes: number): Reply => ({
    content: `🎉 Welcome to our SEKAI, <@${targetId}>! I'm so excited to create amazing things with you~ ♪\nStrikes: **${formatStrikes(strikes)}**`,
});

export const deboardRefusals = (targetId: string): Wording => ({
    MEMBER_NOT_FOUND: () => 'User not found in the database.',
    MEMBER_ALREADY_DEBOARDED: () => `<@${targetId}> has already been deboarded.`,
});

export const deboardedLog = (targetId: string): string =>
    `👋 <@${targetId}> has been deboarded. All their work remains in the SEKAI's memory.`;

export const deboarded = (targetId: string, statusMessage: string): Reply => ({
    content: `👋 <@${targetId}> has been safely deboarded. Their completed tasks will remain in our records as a memory of their time with us~ ✨\n✨ Status: ${statusMessage}`,
});
