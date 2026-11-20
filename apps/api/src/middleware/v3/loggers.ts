import { type NextFunction, type Request, type Response } from 'express'
import { gmLog } from '@gmod/shared/logger.js'
import { redactLogData } from '@/utils/redactLogData.js'

export default (req: Request, res: Response, next: NextFunction) => {
  const method = req.method
  const url = req.url.split('?')[0]
  const ip = req.headers['cf-connecting-ip'] || req.ip
  const id = url.split('/')[2]
  const query = JSON.stringify(redactLogData(req.query))

  const cpBody = structuredClone(req.body)

  if (url.endsWith('/bugs') && cpBody && cpBody.screenshot && cpBody.screenshot.screenshot) {
    cpBody.screenshot.screenshot = '[IMAGE]'
  } else if (url.endsWith('/screenshots') && cpBody && cpBody.screenshot) {
    cpBody.screenshot = '[IMAGE]'
  }

  gmLog(
    'api',
    `Method: ${method} URL: ${url} IP: ${ip} Server ID: ${id} Body: ${JSON.stringify(redactLogData(cpBody))} Query: ${query}`,
  )

  next()
}
