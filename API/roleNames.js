export const buildRoleNames = (...configs) => {
    const names = new Map();
    for (const config of configs) {
        for (const [roleId, rule] of Object.entries(config?.RULES ?? {})) {
            if (!names.has(roleId) && rule?.name) {
                names.set(roleId, String(rule.name).replaceAll('_', ' '));
            }
        }
    }
    return names;
};
