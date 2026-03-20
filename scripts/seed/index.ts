import { devSeedGuild } from './gm_guild.js'
import { devSeedServer } from './gm_server.js'
import { devSeedAutoRoles } from './gm_guild_auto_roles.js'
import { devSeedUser } from './gm_user.js'
import { devSeedGuildLinks } from './gm_guild_links.js'

const startedAt = Date.now()

try {
  console.log('### Starting seed sequence...')

  console.log('### Seeded guild')
  await devSeedGuild()

  console.log('### Seeded server')
  await devSeedAutoRoles()

  console.log('### Seeded guild auto roles')
  await devSeedServer()

  console.log('### Seeded user')
  await devSeedUser()

  console.log('### Seeded guild links')
  await devSeedGuildLinks()

  const endedAt = Date.now()
  console.log(`### Seed sequence completed in ${(endedAt - startedAt) / 1000} seconds`)
} catch (error) {
  console.error('### Seed sequence failed', error)
  throw error
}
