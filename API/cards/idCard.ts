import { escapeXml, stripEmojis, wrapText } from './text.ts';

export interface IdCardFacts {
    readonly discordId: string;
    readonly rawUsername: string;
    readonly isOnHiatus: boolean;
    readonly rawStrikesVal: string;
    readonly rawJoinedAt: string;
    readonly rawMikuDescription: string;
    readonly serverRoles: readonly string[];
    readonly workRoles: readonly string[];
    readonly tasksCompleted: number;
    readonly avatarB64: string;
    readonly decorB64: string;
}

const ID_CARD_HEAD = `<defs>
                <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
                    <stop offset="0%" stop-color="#94e2d5" stop-opacity="0.15"/>
                    <stop offset="100%" stop-color="#94e2d5" stop-opacity="0"/>
                </radialGradient>
                <clipPath id="avatarClip">
                    <rect x="24" y="24" width="75" height="75" rx="12" />
                </clipPath>
            </defs>

            <style>
                .title { font-family: 'Inter', sans-serif; font-size: 22.4px; font-weight: 800; fill: #cdd6f4; }
                .subtitle { font-family: 'JetBrains Mono', monospace; font-size: 13.6px; fill: #a6adc8; }
                .badge-text { font-family: 'Inter', sans-serif; font-size: 11.2px; font-weight: 700; }
                .insight-text { font-family: 'Inter', sans-serif; font-size: 14px; fill: #cdd6f4; }
                .role-title { font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 700; fill: #a6adc8; letter-spacing: 0.5px; }
                .role-tag { font-family: 'Inter', sans-serif; font-size: 12px; fill: #cdd6f4; }
                .stat-label { font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 700; fill: #a6adc8; letter-spacing: 0.5px; }
                .stat-val { font-family: 'JetBrains Mono', monospace; font-size: 19.2px; font-weight: 800; }
                .footer-text { font-family: 'JetBrains Mono', monospace; font-size: 10.4px; font-weight: 700; fill: #585b70; letter-spacing: 0.5px;}
            </style>`;

const renderRole = (index: number, roleName: string, yOffset: number): string => {
    if (!roleName || roleName === '-') return '';
    const xOffset = index === 0 ? 24 : 140;
    const cleanRole = stripEmojis(roleName).substring(0, 15);
    return `
            <rect x="${String(xOffset)}" y="${String(yOffset)}" width="106" height="22" rx="6" fill="#45475a" stroke="#585b70" stroke-width="1" />
            <text x="${String(xOffset + 53)}" y="${String(yOffset + 15.5)}" class="role-tag" text-anchor="middle">${escapeXml(cleanRole)}</text>
            `;
};

interface CardTop {
    readonly decorB64: string;
    readonly avatarB64: string;
    readonly displayUsername: string;
    readonly discordId: string;
    readonly hiatusLabel: string;
    readonly strikesVal: string;
    readonly quoteY1: number;
    readonly quoteLine1: string;
    readonly quoteLine2: string;
}

const drawTop = ({
    decorB64,
    avatarB64,
    displayUsername,
    discordId,
    hiatusLabel,
    strikesVal,
    quoteY1,
    quoteLine1,
    quoteLine2,
}: CardTop): string => `<?xml version="1.0" encoding="UTF-8"?>
        <svg xmlns="http://www.w3.org/2000/svg" width="900" height="870" viewBox="0 0 450 435" role="img">
            ${ID_CARD_HEAD}

            <rect x="1" y="1" width="448" height="433" fill="#313244" rx="15" />
            <rect x="1" y="1" width="448" height="433" fill="none" stroke="#45475a" stroke-width="2" rx="15" />

            <circle cx="400" cy="20" r="100" fill="url(#glow)" />
            <image x="366" y="14" width="60" height="60" href="${escapeXml(decorB64)}" opacity="0.8" />

            <image x="24" y="24" width="75" height="75" href="${escapeXml(avatarB64)}" clip-path="url(#avatarClip)"/>
            <rect x="24" y="24" width="75" height="75" rx="12" fill="none" stroke="#94e2d5" stroke-width="2" />
            
            <text x="115" y="44" class="title">${escapeXml(displayUsername)}</text>
            <text x="115" y="66" class="subtitle">@${escapeXml(discordId)}</text>

            <rect x="115" y="80" width="70" height="20" rx="6" fill="#a6e3a1" fill-opacity="0.15" stroke="#a6e3a1" stroke-width="1" />
            <text x="150" y="94" class="badge-text" fill="#a6e3a1" text-anchor="middle">${escapeXml(hiatusLabel)}</text>

            <rect x="195" y="80" width="85" height="20" rx="6" fill="#89dceb" fill-opacity="0.15" stroke="#89dceb" stroke-width="1" />
            <text x="237.5" y="94" class="badge-text" fill="#89dceb" text-anchor="middle">${escapeXml(strikesVal)}</text>

            <rect x="24" y="125" width="402" height="45" rx="8" fill="#181825" stroke="#f5c2e7" stroke-dasharray="4 4" stroke-width="1" />
            <text x="34" y="148" fill="#f5c2e7" font-size="16" font-family="serif" font-weight="900">"</text>
            <text x="48" y="${String(quoteY1)}" class="insight-text">${escapeXml(quoteLine1)}</text>
            ${quoteLine2 ? `<text x="48" y="${String(quoteY1 + 18)}" class="insight-text">${escapeXml(quoteLine2)}</text>` : ''}

`;

interface CardBottom {
    readonly serverRoles: readonly string[];
    readonly workRoles: readonly string[];
    readonly tasksCompleted: number;
    readonly joinedAt: string;
}

const drawBottom = ({
    serverRoles,
    workRoles,
    tasksCompleted,
    joinedAt,
}: CardBottom): string => `            <text x="24" y="200" class="role-title">SERVER ROLES</text>
            ${renderRole(0, serverRoles[0] || 'Member', 210)}
            ${renderRole(1, serverRoles[1] || '', 210)}

            <text x="24" y="260" class="role-title">WORK TAGS</text>
            ${renderRole(0, workRoles[0] || 'No tasks yet', 270)}
            ${renderRole(1, workRoles[1] || '', 270)}

            <rect x="24" y="310" width="195" height="65" rx="8" fill="#181825" stroke="#45475a" stroke-width="1" />
            <text x="40" y="335" class="stat-label">TASKS DONE</text>
            <text x="40" y="362" class="stat-val" fill="#94e2d5">${String(tasksCompleted)}</text>

            <rect x="231" y="310" width="195" height="65" rx="8" fill="#181825" stroke="#45475a" stroke-width="1" />
            <text x="247" y="335" class="stat-label">JOINED DATE</text>
            <text x="247" y="362" class="stat-val" fill="#89dceb">${escapeXml(joinedAt)}</text>

            <line x1="24" y1="400" x2="426" y2="400" stroke="#45475a" stroke-width="1" />
            <text x="24" y="420" class="footer-text">SEKAI ANALYTICS CENTER</text>
            <text x="426" y="420" class="footer-text" text-anchor="end">BLOSSOMING SEKAI'S MIKU</text>
        </svg>`;

export const drawIdCard = ({
    discordId,
    rawUsername,
    isOnHiatus,
    rawStrikesVal,
    rawJoinedAt,
    rawMikuDescription,
    serverRoles,
    workRoles,
    tasksCompleted,
    avatarB64,
    decorB64,
}: IdCardFacts): string => {
    const username = stripEmojis(rawUsername);
    const displayUsername = username.length > 18 ? username.substring(0, 18) + '...' : username;

    const hiatusLabel = isOnHiatus ? 'On Hiatus' : 'Active';
    const strikesVal = stripEmojis(rawStrikesVal).substring(0, 15);
    const joinedAt = stripEmojis(rawJoinedAt);

    const [quoteLine1, quoteLine2] = wrapText(stripEmojis(rawMikuDescription), 48);
    const quoteY1 = quoteLine2 ? 142 : 150;

    const svg =
        drawTop({
            decorB64,
            avatarB64,
            displayUsername,
            discordId,
            hiatusLabel,
            strikesVal,
            quoteY1,
            quoteLine1,
            quoteLine2,
        }) + drawBottom({ serverRoles, workRoles, tasksCompleted, joinedAt });
    return svg;
};
