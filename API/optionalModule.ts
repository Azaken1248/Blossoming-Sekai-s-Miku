type Importer = (href: string) => Promise<{ readonly default?: unknown }>;

const isMissing = (error: unknown, url: URL) => {
    const { code, message } = (error ?? {}) as { readonly code?: unknown; readonly message?: unknown };
    return (
        code === 'ERR_MODULE_NOT_FOUND' &&
        String(message).includes(url.pathname.slice(url.pathname.lastIndexOf('/') + 1))
    );
};

export const importOptionalDefault = async (
    url: URL,
    importer: Importer = (href) => import(href) as Promise<{ readonly default?: unknown }>,
): Promise<unknown> => {
    try {
        return (await importer(url.href)).default;
    } catch (error) {
        if (isMissing(error, url)) return null;
        throw error;
    }
};
