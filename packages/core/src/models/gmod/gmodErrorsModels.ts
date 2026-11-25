import { capabilityLimit, resolveGuildAccess } from '@gmod/domain-access/index.js'
import { getServerFromID } from '@gmod/domain-server/Server.js'
import { Query } from '../../classes/db/Query.js'
import { GmodErrors, getErrorsByServer } from '@gmod/domain-gmod/GmodErrors.js'
import { enqueueDiscordServerLuaError } from '@gmod/infra-bullmq/discordQueueAdapters.js'
import { gmLog } from '@gmod/shared/logger.js'
import { getLuaErrorChannel } from './luaErrorChannels.js'

export class InvalidErrorPayloadError extends Error {
  constructor() {
    super('Invalid error data')
    this.name = 'InvalidErrorPayloadError'
  }
}

export class InvalidQueryParametersError extends Error {
  constructor() {
    super('Invalid query parameters')
    this.name = 'InvalidQueryParametersError'
  }
}

export async function reportGmodErrorPayload(
  body: any,
  params: {
    serverID: string
    steamID64: string
  },
) {
  const { error, stack, id, name, realm, uptime, count } = body
  const { serverID, steamID64 } = params

  let parsedError: GmodErrors
  try {
    parsedError = GmodErrors.from({
      error,
      stack: JSON.stringify(stack),
      workshopID: id,
      name,
      realm,
      uptime,
      count,
      serverID,
      steamID64,
    })
  } catch {
    throw new InvalidErrorPayloadError()
  }

  const saved = await parsedError.save()
  if (saved?.acknowledged) {
    try {
      if (!(await getLuaErrorChannel(serverID)).channelID) return saved
      await enqueueDiscordServerLuaError({
        serverID,
        errorID: saved.insertedId.toHexString(),
        report: parsedError,
      })
    } catch {
      // Report storage is authoritative even when Discord delivery cannot be queued.
      gmLog('warn', 'A Lua error was saved, but its Discord notification could not be queued.')
    }
  }
  return saved
}

export async function reportGmodErrorPayloadSafe(
  body: any,
  params: {
    serverID: string
    steamID64: string
  },
) {
  try {
    return {
      status: 200,
      body: await reportGmodErrorPayload(body, params),
    }
  } catch (error) {
    if (error instanceof InvalidErrorPayloadError) {
      return {
        status: 400,
        body: { error: 'Invalid error data' },
      }
    }
    throw error
  }
}

export async function getServerErrorsPayload(rawQuery: unknown, serverID: string, guildID?: string) {
  let query: Query
  try {
    query = Query.from(rawQuery)
  } catch {
    throw new InvalidQueryParametersError()
  }

  // getErrorsByServer() always resolves to a { errors, query } object (never null/undefined),
  // so no fallback is needed here.
  const scope = guildID || (await getServerFromID(serverID))?.guild
  if (!scope) throw new Error('Server not found')
  const access = await resolveGuildAccess(scope)
  return await getErrorsByServer(query, serverID, capabilityLimit(access, 'errors.history'))
}

export async function getServerErrorsPayloadSafe(rawQuery: unknown, serverID: string, guildID?: string) {
  try {
    return {
      status: 200,
      body: await getServerErrorsPayload(rawQuery, serverID, guildID),
    }
  } catch (error) {
    if (error instanceof InvalidQueryParametersError) {
      return {
        status: 400,
        body: { error: 'Invalid query parameters' },
      }
    }
    throw error
  }
}
