import type { MemberRepository } from '../Utils/DBUtils/types.ts';
import { DomainError } from '../Utils/domain/errors.ts';
import type { Member } from '../Utils/domain/model.ts';

export const DEFAULT_CARD_SERVICE_URL = 'https://sekaicard.azaken.com';

interface Dependencies {
    readonly members: Pick<MemberRepository, 'findByDiscordId'>;
    readonly fetch: (url: string) => Promise<Response>;
    readonly baseUrl: string;
}

export type Card =
    { readonly kind: 'deboarded'; readonly member: Member } | { readonly kind: 'card'; readonly image: Buffer };

export const readCardServiceUrl = (raw: string | undefined): string => {
    const value = raw?.trim();
    if (!value) return DEFAULT_CARD_SERVICE_URL;
    const url = URL.parse(value);
    if (url === null || !['http:', 'https:'].includes(url.protocol)) {
        throw new RangeError(`CARD_SERVICE_URL must be an http or https address, got "${value}"`);
    }
    return value.endsWith('/') ? value.slice(0, -1) : value;
};

export const createCardService = ({ members, fetch, baseUrl }: Dependencies) => ({
    get: async (discordId: string): Promise<Card> => {
        const member = await members.findByDiscordId(discordId);
        if (member?.isDeboarded) return { kind: 'deboarded', member };
        const response = await fetch(`${baseUrl}/api/card/${discordId}`);
        if (!response.ok) throw new DomainError('CARD_NOT_FOUND');
        return { kind: 'card', image: Buffer.from(await response.arrayBuffer()) };
    },
});

export type CardService = ReturnType<typeof createCardService>;
