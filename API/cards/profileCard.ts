import { escapeXml } from './text.ts';

export interface ProfileCardUser {
    readonly discordId: string;
    readonly username?: string;
    readonly strikes?: number;
    readonly isOnHiatus?: boolean;
    readonly joinedAt?: unknown;
    readonly actualRoles?: readonly string[];
    readonly roles?: unknown;
    readonly avatarUrl?: string | null;
    readonly profileImageUrl?: string | null;
    readonly mikuDescription?: string;
    readonly tasksCompleted?: number;
    readonly topTaskRoles?: readonly string[];
}

export interface ProfileCardMetrics {
    readonly tasksCompleted?: number | undefined;
    readonly topTaskRoles?: readonly string[] | undefined;
}

const thumbsAvatar = (discordId = '', username = 'Miku Fan') => {
    const seed = encodeURIComponent(discordId || username || 'miku');
    return `https://api.dicebear.com/9.x/thumbs/svg?seed=${seed}&backgroundColor=94e2d5,cba6f7,89dceb`;
};

const PROFILE_CARD_HEAD = `<defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#1e1e2e"/>
            <stop offset="100%" stop-color="#11111b"/>
        </linearGradient>
        <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#94e2d5"/>
            <stop offset="50%" stop-color="#89dceb"/>
            <stop offset="100%" stop-color="#cba6f7"/>
        </linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="20" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>`;

const listed = (roles: unknown): string | null =>
    Array.isArray(roles) && roles.length > 0 ? (roles as string[]).slice(0, 2).join(' • ') : null;

const rolesOf = (user: ProfileCardUser, metrics: ProfileCardMetrics) => ({
    serverRoles: listed(user.actualRoles) ?? listed(user.roles) ?? 'Crew Member',
    workRoles: listed(metrics.topTaskRoles) ?? 'No task role data',
});

const valuesOf = (user: ProfileCardUser, metrics: ProfileCardMetrics, stickerUris: readonly string[]) => {
    const username = escapeXml(user.username || 'Unknown User');
    const discordId = escapeXml(user.discordId || 'unknown');
    const strikes = user.strikes || 0;
    const hiatusLabel = user.isOnHiatus ? 'On Hiatus' : 'Active';
    const joinedAt = user.joinedAt
        ? new Date(user.joinedAt as string | number | Date).toLocaleDateString('en-US')
        : 'Unknown';
    const { serverRoles, workRoles } = rolesOf(user, metrics);
    const avatarUrl = escapeXml(user.avatarUrl || user.profileImageUrl || thumbsAvatar(user.discordId, user.username));
    const completed = metrics.tasksCompleted || 0;
    const mikuDescription = escapeXml(
        user.mikuDescription || `${user.username || 'This teammate'} keeps adding sparkles to Sekai!`,
    );
    const [stickerOne, stickerTwo] = stickerUris;

    return {
        username,
        discordId,
        strikes,
        hiatusLabel,
        joinedAt,
        serverRoles,
        workRoles,
        avatarUrl,
        completed,
        mikuDescription,
        stickerOne,
        stickerTwo,
    };
};

const drawFrame = (
    username: string,
    stickerOne: string | undefined,
    stickerTwo: string | undefined,
): string => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${username} profile card">
    ${PROFILE_CARD_HEAD}

    <rect width="1200" height="630" fill="url(#bg)" rx="32"/>
    <circle cx="110" cy="80" r="80" fill="#94e2d5" opacity="0.18" filter="url(#glow)"/>
    <circle cx="1070" cy="550" r="90" fill="#cba6f7" opacity="0.16" filter="url(#glow)"/>

    <rect x="42" y="42" width="1116" height="546" rx="28" fill="#313244" opacity="0.72"/>
    <rect x="42" y="42" width="1116" height="546" rx="28" fill="none" stroke="url(#accent)" stroke-width="3"/>

    ${stickerOne ? `<image x="930" y="54" width="180" height="180" href="${stickerOne}" opacity="0.85"/>` : ''}
    ${stickerTwo ? `<image x="1010" y="430" width="140" height="140" href="${stickerTwo}" opacity="0.82"/>` : ''}

`;

export const drawProfileCard = (
    user: ProfileCardUser,
    metrics: ProfileCardMetrics,
    stickerUris: readonly string[],
): string => {
    const {
        username,
        discordId,
        strikes,
        hiatusLabel,
        joinedAt,
        serverRoles,
        workRoles,
        avatarUrl,
        completed,
        mikuDescription,
        stickerOne,
        stickerTwo,
    } = valuesOf(user, metrics, stickerUris);

    return (
        drawFrame(username, stickerOne, stickerTwo) +
        `    <image x="92" y="170" width="180" height="180" href="${avatarUrl}"/>

    <text x="312" y="212" fill="#94e2d5" font-size="36" font-family="Inter,Segoe UI,sans-serif" font-weight="700">${username}</text>
    <text x="312" y="252" fill="#bac2de" font-size="24" font-family="Inter,Segoe UI,sans-serif">ID: ${discordId}</text>
    <text x="312" y="290" fill="#cdd6f4" font-size="22" font-family="Inter,Segoe UI,sans-serif">Server Roles: ${escapeXml(serverRoles)}</text>
    <text x="312" y="322" fill="#a6adc8" font-size="20" font-family="Inter,Segoe UI,sans-serif">Work Roles: ${escapeXml(workRoles)}</text>

    <rect x="312" y="350" width="190" height="54" rx="27" fill="#94e2d5" opacity="0.2"/>
    <text x="407" y="384" text-anchor="middle" fill="#94e2d5" font-size="22" font-family="Inter,Segoe UI,sans-serif" font-weight="700">${escapeXml(hiatusLabel)}</text>

    <rect x="524" y="350" width="220" height="54" rx="27" fill="#f5c2e7" opacity="0.2"/>
    <text x="634" y="384" text-anchor="middle" fill="#f5c2e7" font-size="22" font-family="Inter,Segoe UI,sans-serif" font-weight="700">Strikes: ${String(strikes)}</text>

    <rect x="766" y="350" width="260" height="54" rx="27" fill="#89dceb" opacity="0.2"/>
    <text x="896" y="384" text-anchor="middle" fill="#89dceb" font-size="22" font-family="Inter,Segoe UI,sans-serif" font-weight="700">Tasks Done: ${String(completed)}</text>

    <text x="92" y="470" fill="#89dceb" font-size="30" font-family="JetBrains Mono,monospace" font-weight="700">Blossoming Sekai's Miku</text>
    <text x="92" y="506" fill="#a6adc8" font-size="20" font-family="Inter,Segoe UI,sans-serif">Joined: ${escapeXml(joinedAt)} • Cute Profile Card</text>
    <text x="92" y="540" fill="#cdd6f4" font-size="18" font-family="Inter,Segoe UI,sans-serif">${mikuDescription}</text>
</svg>`
    );
};
