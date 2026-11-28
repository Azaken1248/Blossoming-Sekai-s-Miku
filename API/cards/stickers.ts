import fs from 'node:fs';
import path from 'node:path';

const STICKER_NAME = /^PNG\s\d+\.png$/i;

const readAsDataUri = (directory: string, fileName: string): string | null => {
    try {
        return `data:image/png;base64,${fs.readFileSync(path.join(directory, fileName)).toString('base64')}`;
    } catch {
        return null;
    }
};

const listStickers = (directory: string): string[] => {
    try {
        return fs.readdirSync(directory).filter((fileName) => STICKER_NAME.test(fileName));
    } catch {
        return [];
    }
};

export const createStickerPicker = (directory: string, random: () => number = Math.random) => {
    const names = listStickers(directory);
    const uris = new Map(names.map((fileName) => [fileName, readAsDataUri(directory, fileName)]));
    return (count = 2): string[] => {
        if (!names.length) return [];
        const shuffled = [...names].sort(() => random() - 0.5);
        return shuffled.slice(0, count).flatMap((fileName) => {
            const uri = uris.get(fileName);
            return uri ? [uri] : [];
        });
    };
};

export const pickStickers = createStickerPicker(path.join(import.meta.dirname, '..', '..', 'public', 'assets'), () =>
    Math.random(),
);
