import { type Server } from '@gmod/domain-server/Server.js'
import { type PanelUser } from '@gmod/domain-user/PanelUser.js'
import { type Guild } from '@gmod/domain-guild/Guild.js'
import type { AuthSession } from '@gmod/domain-auth/authSessions.js'

declare global {
  namespace Express {
    interface Request {
      server?: Server
      panelUser?: PanelUser
      authSession?: AuthSession
      guild?: Guild
      dscGuild?: any
      rawBody?: string
    }
  }
}
