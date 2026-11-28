type Fetch = (url: string) => Promise<Response>;

export const createImageLoader =
    (fetch: Fetch) =>
    async (url: string): Promise<string> => {
        try {
            const response = await fetch(url);
            const buffer = Buffer.from(await response.arrayBuffer());
            const mimeType = response.headers.get('content-type') || 'image/png';
            return `data:${mimeType};base64,${buffer.toString('base64')}`;
        } catch {
            return '';
        }
    };

export const loadImage = createImageLoader((url) => globalThis.fetch(url));
