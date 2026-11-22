export const MAX_SEARCH_LENGTH = 100;

export class SearchTooLongError extends RangeError {
    constructor(maxLength) {
        super(`Search text must be at most ${maxLength} characters`);
        this.name = 'SearchTooLongError';
        this.maxLength = maxLength;
    }
}

const REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

export const containsText = (text, maxLength = MAX_SEARCH_LENGTH) => {
    const value = String(text);
    if (value.length > maxLength) {
        throw new SearchTooLongError(maxLength);
    }
    return { $regex: value.replace(REGEX_SPECIAL_CHARACTERS, '\\$&'), $options: 'i' };
};
