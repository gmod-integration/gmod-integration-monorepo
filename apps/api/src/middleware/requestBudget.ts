import type { RequestHandler } from 'express'
import { hasJSONBudget, type JSONBudget } from '@gmod/shared/jsonBudget.js'

const bodyBudget: JSONBudget = {
  maxDepth: 16,
  maxNodes: 8192,
  maxArrayLength: 500,
  maxObjectKeys: 256,
  maxStringLength: 65_536,
  maxCharacters: 262_144,
}
const queryBudget: JSONBudget = {
  ...bodyBudget,
  maxDepth: 4,
  maxNodes: 500,
  maxArrayLength: 100,
  maxObjectKeys: 100,
  maxStringLength: 4096,
  maxCharacters: 16_384,
}

/** Reject structural amplification before route schemas; errors never serialize the submitted body. */
export const requestBudget: RequestHandler = (req, res, next) => {
  const path = req.path.toLowerCase()
  const v6 = path === '/v6' || path.startsWith('/v6/')
  const avatar = /^\/v3\/users\/[^/]+\/guilds\/[^/]+\/bot\/?$/.test(path)
  const capture = /^\/v3\/clients\/[^/]+\/servers\/[^/]+\/(screenshots|bugs)\/?$/.test(path)
  const budget =
    avatar || capture
      ? {
          ...bodyBudget,
          maxStringLength: avatar ? 3 * 1024 * 1024 : 10 * 1024 * 1024,
          maxCharacters: avatar ? 3 * 1024 * 1024 : 10 * 1024 * 1024,
        }
      : bodyBudget
  const body = req.body as unknown
  const statusButtons = /^\/v6\/guilds\/[^/]+\/servers\/[^/]+\/status\/configuration\/?$/.test(path)
  const tooManyButtons =
    statusButtons &&
    body &&
    typeof body === 'object' &&
    'buttons' in body &&
    Array.isArray(body.buttons) &&
    body.buttons.length > 25
  if (
    !hasJSONBudget(req.query, queryBudget) ||
    (body !== undefined && !hasJSONBudget(body, budget)) ||
    tooManyButtons
  ) {
    res.setHeader('Cache-Control', 'no-store')
    res
      .status(413)
      .json(
        v6
          ? { error: { code: 'invalid_request', message: 'The request structure is too large or unsupported.' } }
          : { error: 'invalid_request' },
      )
    return
  }
  next()
}
