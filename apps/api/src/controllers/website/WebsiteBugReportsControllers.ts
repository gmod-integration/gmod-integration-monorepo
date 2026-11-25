import { type Request, type Response } from 'express'
import {
  getBugReportChannel,
  setBugReportChannel,
  removeBugReportChannel,
  BugReportChannelError,
} from '@gmod/core/models/gmod/bugReportChannels.js'

export async function getServerBugReportsChannel(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  return res.json(await getBugReportChannel(req.server!.id))
}

export async function postServerBugReportsChannel(req: Request, res: Response) {
  try {
    return res.json(await setBugReportChannel(req.server!.id, req.body))
  } catch (error) {
    if (error instanceof BugReportChannelError) return res.status(error.status).json({ error: error.code })
    throw error
  }
}

export async function deleteServerBugReportsChannel(req: Request, res: Response) {
  return res.json(await removeBugReportChannel(req.server!.id))
}
