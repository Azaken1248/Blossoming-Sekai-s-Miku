export const MAX_STRIKES = 3;

export const shouldDemote = (strikeCount: number): boolean => strikeCount >= MAX_STRIKES;

export const formatStrikes = (strikeCount: number | null | undefined): string =>
    `${String(strikeCount ?? 0)}/${String(MAX_STRIKES)}`;
