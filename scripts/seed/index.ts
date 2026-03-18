import { devSeedGuild } from './gm_guild.js'
import { devSeedServer } from './gm_server.js'
import { devSeedAutoRoles } from './gm_guild_auto_roles.js'

const startedAt = Date.now()

try {
  console.log('### Starting seed sequence...')

  console.log('### Seeded guild')
  await devSeedGuild()

  console.log('### Seeded server')
  await devSeedAutoRoles()

  console.log('### Seeded auto roles')
  await devSeedServer()

  const endedAt = Date.now()
  console.log(`### Seed sequence completed in ${(endedAt - startedAt) / 1000} seconds`)
} catch (error) {
  console.error('### Seed sequence failed', error)
  throw error
}
