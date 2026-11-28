interface RoleRule {
    readonly name?: unknown;
}

interface RuleSource {
    readonly RULES?: Readonly<Record<string, RoleRule | null | undefined>>;
}

export const buildRoleNames = (...configs: unknown[]): Map<string, string> => {
    const names = new Map<string, string>();
    for (const config of configs) {
        const rules = (config as RuleSource | null | undefined)?.RULES ?? {};
        for (const [roleId, rule] of Object.entries(rules)) {
            if (!names.has(roleId) && rule?.name)
                names.set(roleId, (rule.name as number).toString().replaceAll('_', ' '));
        }
    }
    return names;
};
