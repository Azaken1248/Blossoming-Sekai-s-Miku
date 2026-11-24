export const importOptionalDefault = async (url, importer = (href) => import(href)) => {
    try {
        return (await importer(url.href)).default;
    } catch (error) {
        const missing =
            error?.code === 'ERR_MODULE_NOT_FOUND' && String(error.message).includes(url.pathname.split('/').pop());
        if (missing) return null;
        throw error;
    }
};
