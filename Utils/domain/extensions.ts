const DAY_MS = 24 * 60 * 60 * 1000;

export const MAX_EXTENSIONS_PER_TASK = 2;

interface ExtensionUse {
    readonly hasExtended?: boolean | undefined;
    readonly extensionCount?: number | undefined;
}

interface ExtendableTask {
    readonly customExtension?: number | null | undefined;
    readonly roleCategoryId: string;
    readonly taskType?: string | null | undefined;
}

interface RoleRule {
    readonly name?: string | undefined;
    readonly extension?: number | undefined;
    readonly extension_skit?: number | undefined;
    readonly extension_story?: number | undefined;
    readonly extension_mv?: number | undefined;
}

interface ExtensionConfig {
    readonly RULES: Readonly<Record<string, RoleRule | undefined>>;
}

export class ConfigError extends Error {
    readonly code = 'CONFIG_MISSING_ROLE';

    constructor(message: string) {
        super(message);
        this.name = 'ConfigError';
    }
}

export const countExtensionsUsed = ({ hasExtended, extensionCount }: ExtensionUse): number =>
    extensionCount || (hasExtended ? 1 : 0);

export const canExtend = (task: ExtensionUse): boolean => countExtensionsUsed(task) < MAX_EXTENSIONS_PER_TASK;

export const resolveExtensionMs = (task: ExtendableTask, config: ExtensionConfig): number | undefined => {
    if (task.customExtension) return task.customExtension;

    const rule = config.RULES[task.roleCategoryId];
    if (!rule) {
        throw new ConfigError(`Role category ${task.roleCategoryId} is not present in config.RULES`);
    }

    if (rule.extension) return rule.extension;

    const taskType = task.taskType ?? '';
    if (taskType.includes('skit')) return rule.extension_skit;
    if (taskType.includes('story')) return rule.extension_story;

    if (!rule.extension_mv) {
        throw new ConfigError(
            `Role ${String(rule.name)} (${task.roleCategoryId}) defines no extension window for task type "${taskType}"`,
        );
    }
    return rule.extension_mv;
};

export const msToDays = (ms: number): number => Math.floor(ms / DAY_MS);
