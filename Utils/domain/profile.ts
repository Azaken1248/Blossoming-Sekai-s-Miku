export interface TaskRole {
    readonly status?: string;
    readonly roleName?: string;
}

export interface TaskTally {
    readonly tasksCompleted: number;
    readonly topTaskRoles: string[];
}

export const tallyTasks = (tasks: readonly TaskRole[], top: number): TaskTally => {
    const counts: Record<string, number> = {};
    for (const task of tasks) {
        const role = task.roleName || 'Unknown';
        counts[role] = (counts[role] ?? 0) + 1;
    }
    return {
        tasksCompleted: tasks.filter((task) => task.status === 'COMPLETED').length,
        topTaskRoles: Object.entries(counts)
            .sort((left, right) => right[1] - left[1])
            .slice(0, top)
            .map(([role]) => role),
    };
};

export const pickRoles = (
    guildRoles: readonly string[],
    storedRoles: readonly string[],
    taskRoles: readonly string[],
): readonly string[] => {
    if (guildRoles.length > 0) return guildRoles;
    return storedRoles.length > 0 ? storedRoles : taskRoles;
};
