/**
 * Strike policy. Kept next to the other domain rules so the limit is stated
 * once rather than being spelled `3` in the schema, the demotion check and
 * every "x/3" message.
 */

export const MAX_STRIKES = 3;

/** True when the member has reached the limit and should lose their crew roles. */
export const shouldDemote = (strikeCount) => Number(strikeCount) >= MAX_STRIKES;

/** Render a strike count for display, e.g. "2/3". */
export const formatStrikes = (strikeCount) => `${strikeCount ?? 0}/${MAX_STRIKES}`;
