// Config
import { ConfigServer } from '@gmod/config'
import { testUser } from './config.test.js'

export function testURL(path: string): string {
  // remplace :discordID by testUser.discordID
  path = path.replace(/:discordID/g, testUser.discordID)
  // remplace :steamID by testUser.steamID
  path = path.replace(/:steamID64/g, testUser.steamID)
  // remplace :serverID by testUser.discordID
  path = path.replace(/:serverID/g, testUser.discordID)
  // remplace :guildID by testUser.discordID
  path = path.replace(/:guildID/g, testUser.discordID)

  return `http://localhost:${ConfigServer.ports.api}${path}`
}

// Seed
import './seed/index.js'

// Test
import('./api/mainController.test.js')
import('./api/serverController.test.js')
import('./api/userController.test.js')
