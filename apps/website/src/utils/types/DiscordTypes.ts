export type TypeDiscordChannel = {
  id: string
  name: string
  type: string | number
  position: number | null
  parentID: string | null
  sendable?: boolean
  textBased?: boolean
}

export type TypeDiscordRole = {
  id: string
  name: string
  color: number
  colorHex: string
}
