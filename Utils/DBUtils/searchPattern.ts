import { MAX_SEARCH_LENGTH } from '../domain/search.ts';

export { MAX_SEARCH_LENGTH };

export class SearchTooLongError extends RangeError {
    readonly maxLength: number;

    constructor(maxLength: number) {
        super(`Search text must be at most ${String(maxLength)} characters`);
        this.name = 'SearchTooLongError';
        this.maxLength = maxLength;
    }
}

const REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

export interface TextPattern {
    $regex: string;
    $options: 'i';
}

export const containsText = (text: unknown, maxLength = MAX_SEARCH_LENGTH): TextPattern => {
    const value = String(text);
    if (value.length > maxLength) {
        throw new SearchTooLongError(maxLength);
    }
    return { $regex: value.replace(REGEX_SPECIAL_CHARACTERS, '\\$&'), $options: 'i' };
};
