/**
 * Extension rules — one implementation, used by both the request path
 * (/extension) and the approval path (the Approve button).
 *
 * These functions are pure: they take a task and the config and return a value
 * or throw. No database, no Discord, no I/O.
 */

/** Thrown when a task references a role category that is not in config.RULES. */
export class ConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ConfigError';
        this.code = 'CONFIG_MISSING_ROLE';
    }
}

export const MAX_EXTENSIONS_PER_TASK = 2;

/**
 * How many extensions a task has already used.
 *
 * `extensionCount` was added after `hasExtended`, so rows written before that
 * change have `hasExtended: true` and `extensionCount: 0`. Reading both here
 * keeps that compatibility in one place instead of two.
 */
export const countExtensionsUsed = (task) => task.extensionCount || (task.hasExtended ? 1 : 0);

export const canExtend = (task) => countExtensionsUsed(task) < MAX_EXTENSIONS_PER_TASK;

/**
 * Resolve how long an extension should be, in milliseconds.
 *
 * Precedence:
 *   1. the task's own customExtension (set for custom tasks at assignment time)
 *   2. the role's flat `extension`
 *   3. the role's task-type-specific window (editor has skit / story / mv)
 *
 * @throws {ConfigError} if the role category is unknown or defines no extension window
 */
export const resolveExtensionMs = (task, config) => {
    if (task.customExtension) return task.customExtension;

    const rule = config.RULES[task.roleCategoryId];
    if (!rule) {
        throw new ConfigError(`Role category ${task.roleCategoryId} is not present in config.RULES`);
    }

    if (rule.extension) return rule.extension;

    const taskType = String(task.taskType ?? '');
    if (taskType.includes('skit')) return rule.extension_skit;
    // NOTE: config defines extension_story but nothing read it before this change,
    // so editor "story" tasks previously fell through to extension_mv. Delete this
    // line to restore the old behaviour.
    if (taskType.includes('story')) return rule.extension_story;

    const fallback = rule.extension_mv;
    if (!fallback) {
        throw new ConfigError(
            `Role ${rule.name} (${task.roleCategoryId}) defines no extension window for task type "${taskType}"`,
        );
    }
    return fallback;
};

export const msToDays = (ms) => Math.floor(ms / (24 * 60 * 60 * 1000));
