import { ConfigServer } from '@gmod/config'

export function gmLog(type: string, message: string, debug: boolean = false) {
  if (debug && !ConfigServer.dev) return
  console.log(`[${new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')}] [${type.toUpperCase()}] ${message}`)
}
