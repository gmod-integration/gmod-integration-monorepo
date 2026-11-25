import { parseArgs } from 'node:util'

export type DevSeedOptions = {
  guildId?: string
  ownerDiscordId?: string
  dryRun: boolean
  discord: boolean
  help: boolean
}

const discordId = /^\d{17,20}$/

function validateDiscordId(value: string | undefined, flag: string): string | undefined {
  if (value !== undefined && !discordId.test(value)) {
    throw new Error(`${flag} must be a Discord ID containing 17 to 20 digits.`)
  }
  return value
}

export function parseDevSeedOptions(args: string[]): DevSeedOptions {
  const { values } = parseArgs({
    args: args[0] === '--' ? args.slice(1) : args,
    strict: true,
    allowPositionals: false,
    options: {
      'guild-id': { type: 'string' },
      'owner-id': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      discord: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  })

  return {
    guildId: validateDiscordId(values['guild-id'], '--guild-id'),
    ownerDiscordId: validateDiscordId(values['owner-id'], '--owner-id'),
    dryRun: values['dry-run'],
    discord: values.discord,
    help: values.help,
  }
}

const localHosts = ['localhost', '127.0.0.1', '[::1]', '::1', 'host.docker.internal']
const mariaHosts = new Set([...localHosts, 'mariadb', 'mysql', 'db'])
const mongoHosts = new Set([...localHosts, 'mongo', 'mongodb'])

function hasOnlyLocalMongoHosts(uri: string): boolean {
  // A comma-separated MongoDB authority is not a standard URL hostname. Validate every
  // seed host individually, including brackets/ports, rather than trusting the first host.
  // SRV discovery is deliberately unavailable for a seed restricted to local databases.
  if (/\s/.test(uri)) return false
  const match = /^mongodb:\/\/([^/?#]+)(?:\/[^?#]*)?(?:\?[^#]*)?$/.exec(uri)
  if (!match) return false

  try {
    decodeURIComponent(uri)
    const authority = match[1]
    const userInfoEnd = authority.lastIndexOf('@')
    if (userInfoEnd !== -1) {
      const credentials = authority.slice(0, userInfoEnd)
      if (!credentials || credentials.includes('@')) return false
    }
    const hostList = authority.slice(userInfoEnd + 1)
    return hostList.split(',').every((host) => {
      if (!host || host.includes('@')) return false
      const parsed = new URL(`http://${host}`)
      return mongoHosts.has(parsed.hostname.toLowerCase()) && parsed.pathname === '/' && !parsed.username
    })
  } catch {
    return false
  }
}

export function assertDevSeedTarget(target: { dev: boolean; mariaHost?: string; mongoUri: string }): void {
  if (!target.dev) throw new Error('Development seed requires DEV=true.')
  if (!target.mariaHost || !mariaHosts.has(target.mariaHost.toLowerCase())) {
    throw new Error('Development seed requires a local MariaDB host.')
  }
  if (!hasOnlyLocalMongoHosts(target.mongoUri)) {
    // Never echo a connection URI: it may contain a database password.
    throw new Error('Development seed requires a valid local mongodb:// URI.')
  }
}

export function selectSeedOwner(explicitId: string | undefined, activeDiscordIds: string[]): string {
  if (explicitId !== undefined) return validateDiscordId(explicitId, '--owner-id')!
  const owners = [...new Set(activeDiscordIds)]
  if (owners.length !== 1) {
    throw new Error('Pass --owner-id to select a developer account, or sign in with exactly one active account.')
  }
  return validateDiscordId(owners[0], '--owner-id')!
}
