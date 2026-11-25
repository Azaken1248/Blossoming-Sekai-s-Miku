import config from '../../config.js';
import { createPermissions } from '../permissions.ts';

const permissions = createPermissions(config);

export const roleIdsOf = (member) => [...member.roles.cache.keys()];

export const actorOf = (member) => (member ? { id: member.id, roleIds: roleIdsOf(member) } : null);

export const isOwner = (member) => permissions.isOwner(actorOf(member));

export const isManagerOrOwner = (member) => permissions.isManagerOrOwner(actorOf(member));
