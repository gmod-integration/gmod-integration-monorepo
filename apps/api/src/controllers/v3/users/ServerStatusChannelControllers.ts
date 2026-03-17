import { type Request, type Response } from 'express'

export async function getServerStatusChannel(req: Request, res: Response) {
  const server = req.server!
  return res.json(await server.getStatusChannel())
}

export async function putServerStatusChannel(req: Request, res: Response) {
  const server = req.server!
  const { channelID, format } = req.body
  return res.json(await server.putStatusChannel(channelID, format))
}
