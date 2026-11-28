import config from '../config.js';
import { bindProfileService } from '../Services/index.ts';
import { guildLookup } from './discord/guild.ts';
import { importOptionalDefault } from './optionalModule.ts';
import { buildRoleNames } from './roleNames.ts';
import { describeMember } from './views/description.ts';

const configProd: unknown = await importOptionalDefault(new URL('../configProd.js', import.meta.url));
const roleNames: Map<string, string> = buildRoleNames(config, configProd);

export const profileService = bindProfileService({
    guild: guildLookup,
    roleName: (stored) => roleNames.get(stored),
    describe: describeMember,
});
