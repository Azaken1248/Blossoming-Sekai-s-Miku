import type { Request, Response } from 'express';
import sharp from 'sharp';
import { drawIdCard } from '../cards/idCard.ts';
import { loadImage } from '../cards/images.ts';
import { drawProfileCard, type ProfileCardUser } from '../cards/profileCard.ts';
import { redirectPage, sharePage, type ShareUser } from '../cards/sharePages.ts';
import { pickStickers } from '../cards/stickers.ts';
import { profileService } from '../services.ts';

const DEFAULT_PICTURE = 'https://sekai.azaken.com/assets/PNG%201.png';
const CARD_DECORATION = 'https://sekai.azaken.com/assets/PNG%202.png';
const DEFAULT_FRONTEND = 'https://sekai.azaken.com';

const discordIdOf = (req: Request) => String(req.params['discordId']);

const initialsAvatar = (username: string) =>
    `https://api.dicebear.com/9.x/initials/png?seed=${encodeURIComponent(username)}&backgroundColor=313244&textColor=94e2d5`;

const joinedText = (joinedAt: unknown) =>
    joinedAt ? new Date(joinedAt as string | number | Date).toLocaleDateString('en-US') : 'Unknown';

const renderIdCard = async (discordId: string): Promise<Buffer | null> => {
    const card = await profileService.card(discordId);
    if (!card) return null;
    const { strikes } = card.member;
    const rawAvatarUrl = card.avatarUrl || initialsAvatar(card.username);
    const avatarB64 = await loadImage(rawAvatarUrl);
    const decorB64 = await loadImage(CARD_DECORATION);
    const svg = drawIdCard({
        discordId: card.member.discordId,
        rawUsername: card.username,
        isOnHiatus: Boolean(card.member.isOnHiatus),
        rawStrikesVal: strikes ? `${String(strikes)} Strikes` : 'Clean Record',
        rawJoinedAt: joinedText(card.member['joinedAt']),
        rawMikuDescription: card.description,
        serverRoles: card.serverRoles,
        workRoles: card.workRoles,
        tasksCompleted: card.tasksCompleted,
        avatarB64,
        decorB64,
    });
    return sharp(Buffer.from(svg)).png({ force: true, quality: 100 }).toBuffer();
};

export const getCardImage = (req: Request, res: Response): void => {
    renderIdCard(discordIdOf(req)).then(
        (png) => {
            if (!png) {
                res.redirect(DEFAULT_PICTURE);
                return;
            }
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=300');
            res.send(png);
        },
        (error: unknown) => {
            console.error('Error generating DB sharp card:', error);
            res.redirect(DEFAULT_PICTURE);
        },
    );
};

type ShareSubject = ProfileCardUser & ShareUser;

const shareSubject = async (discordId: string): Promise<ShareSubject | null> => {
    const summary = await profileService.summary(discordId).catch((error: unknown) => {
        console.error('[SHARE] Failed to build user summary:', error);
        return null;
    });
    const subject = summary ?? (await profileService.storedMember(discordId));
    return subject as ShareSubject | null;
};

export const getProfileCardSvg = (req: Request, res: Response): void => {
    shareSubject(discordIdOf(req)).then(
        (user) => {
            if (!user) return res.status(404).send('User not found');
            const metrics = { tasksCompleted: user.tasksCompleted, topTaskRoles: user.topTaskRoles };
            res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
            res.setHeader('Cache-Control', 'public, max-age=300');
            return res.send(drawProfileCard(user, metrics, pickStickers(2)));
        },
        () => res.status(500).send('Unable to render card'),
    );
};

export const getSharePage = (req: Request, res: Response): void => {
    shareSubject(discordIdOf(req)).then(
        (user) => {
            if (!user) return res.status(404).send('<h1>User not found</h1>');
            const baseUrl = `${req.protocol}://${String(req.get('host'))}`;
            return res.send(sharePage(user, baseUrl));
        },
        () => res.status(500).send('<h1>Failed to load share page</h1>'),
    );
};

export const getRedirectPage = (req: Request, res: Response): void => {
    profileService.record(discordIdOf(req)).then(
        (user) => {
            if (!user) return res.status(404).send('User not found');
            const frontendUrl = process.env['FRONTEND_URL'] || DEFAULT_FRONTEND;
            return res.send(redirectPage(user as ShareUser, frontendUrl));
        },
        (error: unknown) => {
            console.error('Error generating share card:', error);
            res.status(500).send('Error generating card');
        },
    );
};
