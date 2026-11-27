export const unix = (date: Date | null): number => Math.round(Number(date) / 1000);

export const localDate = (date: Date | null): string => new Date(Number(date)).toLocaleDateString();

export const FIELD_LIMIT = 1024;

export const chunkLines = (lines: readonly string[], limit = FIELD_LIMIT): string[] => {
    const chunks: string[] = [];
    let current = '';
    for (const line of lines) {
        if ((current + line + '\n').length > limit) {
            chunks.push(current);
            current = line + '\n';
        } else {
            current += line + '\n';
        }
    }
    if (current) chunks.push(current);
    return chunks;
};
