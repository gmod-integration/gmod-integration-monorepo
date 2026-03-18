import { testSeedGuild } from './gm_guild.js'
import { testClearServer, testSeedServer } from './gm_server.js'
import { testClearAutoRoles, testSeedAutoRoles } from './gm_guild_auto_roles.js'

await testSeedGuild()

await testClearServer()
await testClearAutoRoles()

await testSeedServer()
await testSeedAutoRoles()
