import { testClearServer, testSeedServer } from './gm_server.js';
await testClearServer();
await testSeedServer();
import { testClearAutoRoles, testSeedAutoRoles } from './gm_guild_auto_roles.js';
await testClearAutoRoles();
await testSeedAutoRoles();