import type { RoleRules } from './model.ts';

export const heldCrewRoles = (roleIds: readonly string[], crewRoleIds: readonly string[]): string[] =>
    crewRoleIds.filter((roleId) => roleIds.includes(roleId));

export const crewRoleNames = (
    roleIds: readonly string[],
    crewRoleIds: readonly string[],
    rules: Readonly<Partial<RoleRules>>,
): string[] =>
    heldCrewRoles(roleIds, crewRoleIds)
        .map((roleId) => rules[roleId]?.name)
        .filter((name): name is string => name !== undefined && name !== '');
