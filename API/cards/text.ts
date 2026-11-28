export const escapeXml = (text: string): string =>
    text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll("'", '&apos;')
        .replaceAll('"', '&quot;');

export const escapeHtml = (text: string): string =>
    text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');

export const stripEmojis = (text: string): string =>
    text
        .replace(/\p{Emoji_Presentation}/gu, '')
        .replace(/\p{Emoji}️/gu, '')
        .trim();

export const wrapText = (text: string, maxLength: number): [string, string] => {
    if (text.length <= maxLength) return [text, ''];
    let splitAt = text.lastIndexOf(' ', maxLength);
    if (splitAt === -1) splitAt = maxLength;
    const first = text.substring(0, splitAt);
    let second = text.substring(splitAt + 1);
    if (second.length > maxLength) second = second.substring(0, maxLength - 3) + '...';
    return [first, second];
};
