import { MAX_STRIKES } from '../../Utils/domain/strikes.ts';
import { escapeHtml } from './text.ts';

export interface ShareUser {
    readonly discordId: string;
    readonly username?: string;
    readonly strikes?: number;
    readonly isOnHiatus?: boolean;
    readonly roles?: readonly string[];
    readonly tasksCompleted?: number;
    readonly mikuDescription?: string;
}

export const redirectPage = (user: ShareUser, frontendUrl: string): string => {
    const embedColor = (user.strikes ?? 0) > 0 ? '#f38ba8' : '#94e2d5';
    const statusText = user.isOnHiatus ? '💤 On Hiatus' : '✨ Active Member';
    const rolesText = user.roles && user.roles.length ? user.roles.join(', ') : 'Crew Member';

    const safeUsername = escapeHtml(user.username || 'Sekai User');
    const safeRoles = escapeHtml(rolesText);
    const safeStatus = escapeHtml(statusText);
    const safeStrikes = escapeHtml(String(user.strikes ?? 0));
    const safeCompleted = escapeHtml(String(user.tasksCompleted || 0));
    const safeDiscordId = encodeURIComponent(user.discordId);

    const FRONTEND_URL = frontendUrl;

    const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>${safeUsername}'s Sekai Profile</title>

            <meta property="og:title" content="🌸 ${safeUsername}'s Sekai ID Card" />
            <meta property="og:type" content="profile" />
            <meta property="og:description" content="Roles: ${safeRoles}&#10;Status: ${safeStatus}&#10;Tasks Completed: ${safeCompleted}&#10;Strikes: ${safeStrikes}/${String(MAX_STRIKES)}" />
            <meta name="theme-color" content="${embedColor}">
            <meta name="twitter:card" content="summary">

            <meta http-equiv="refresh" content="0; url=${escapeHtml(`${FRONTEND_URL}/profile.html?discordId=${safeDiscordId}`)}" />
        </head>
        <body style="background-color: #1e1e2e; color: #cdd6f4; font-family: sans-serif; text-align: center; padding: 50px;">
            <h2>Redirecting to ${safeUsername}'s profile...</h2>
            <p>If you are not redirected, <a href="${escapeHtml(`${FRONTEND_URL}/profile.html?discordId=${safeDiscordId}`)}" style="color: #94e2d5;">click here</a>.</p>
        </body>
        </html>
        `;

    return html;
};

export const sharePage = (user: ShareUser, baseUrl: string): string => {
    const cardImageUrl = `${baseUrl}/api/users/${encodeURIComponent(user.discordId)}/card.png`;
    const sharePageUrl = `${baseUrl}/share/user/${encodeURIComponent(user.discordId)}`;
    const profileWebUrl = `${baseUrl}/public/profile.html?discordId=${encodeURIComponent(user.discordId)}`;
    const title = `${user.username || 'Sekai User'} • Blossoming Sekai Profile`;
    const description = `${user.username || 'User'} • ${String(user.tasksCompleted || 0)} tasks done • ${user.isOnHiatus ? 'On Hiatus' : 'Active'} • ${String(user.strikes || 0)} strike(s) • ${user.mikuDescription || 'Miku-approved teammate!'}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(sharePageUrl)}" />
    <meta property="og:image" content="${escapeHtml(cardImageUrl)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(cardImageUrl)}" />
    <style>
        body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #1e1e2e; color: #cdd6f4; font-family: Inter, 'Segoe UI', sans-serif; }
        .wrap { width: min(900px, 92vw); padding: 24px; border: 1px solid #45475a; border-radius: 18px; background: #313244; }
        .title { font-size: 1.4rem; font-weight: 700; color: #94e2d5; margin-bottom: 10px; }
        .desc { color: #bac2de; margin-bottom: 16px; }
        img { width: 100%; border-radius: 14px; border: 1px solid #45475a; }
        a { color: #89dceb; }
    </style>
</head>
<body>
    <main class="wrap">
        <div class="title">${escapeHtml(user.username || 'Sekai User')}</div>
        <div class="desc">${escapeHtml(description)}</div>
        <img src="${escapeHtml(cardImageUrl)}" alt="Profile card preview" />
        <p>Open full profile page: <a href="${escapeHtml(profileWebUrl)}">${escapeHtml(profileWebUrl)}</a></p>
    </main>
</body>
</html>`;

    return html;
};
