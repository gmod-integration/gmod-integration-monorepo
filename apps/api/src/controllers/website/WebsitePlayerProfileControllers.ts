import type { Request, Response } from 'express'
import { processGetPlayerProfile } from '@gmod/core/models/v3/playerProfileModels.js'

export async function getPlayerProfile(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  const result = await processGetPlayerProfile(req.panelUser!.discordID, req.params.steamID64, req.query)
  return res.status(result.status).json(result.body)
}

export async function getPlayerProfileByDiscord(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  const result = await processGetPlayerProfile(
    req.panelUser!.discordID,
    req.params.targetDiscordID,
    req.query,
    undefined,
    'discord',
  )
  return res.status(result.status).json(result.body)
}

export async function getPlayerProfileBySteam(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  const result = await processGetPlayerProfile(
    req.panelUser!.discordID,
    req.params.steamID64,
    req.query,
    undefined,
    'steam',
  )
  return res.status(result.status).json(result.body)
}
