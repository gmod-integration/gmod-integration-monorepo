import { describe, expect, it } from 'vitest'
import { GmodEntity } from '../src/GmodEntity.js'
import { GmodPlayer } from '../src/GmodPlayers.js'
import { GmodServer } from '../src/GmodServer.js'
import { GmodScreenshot } from '../src/GmodScreenshot.js'

const validPosition = { x: 1, y: 2, z: 3 }
const validAngle = { p: 0, y: 90, r: 180 }
const validTeam = { id: 1, name: 'Staff' }
const validWeapon = { class: 'weapon_physgun', printName: 'Physics Gun' }

const validPlayerInput = {
  steamID64: '76561198219049673',
  steamID: 'STEAM_0:1:129391972',
  name: 'Linventif',
  userGroup: 'superadmin',
  kills: 0,
  deaths: 0,
  branch: 'unknown',
  customValues: { level: 1 },
  team: validTeam,
  position: validPosition,
  angle: validAngle,
  weapon: validWeapon,
}

describe('GmodEntity', () => {
  it('parses valid data and composes nested value classes', () => {
    const entity = GmodEntity.from({
      class: 'prop_physics',
      model: 'models/props_c17/oildrum001.mdl',
      position: validPosition,
      angle: validAngle,
    })

    expect(entity.position).toMatchObject(validPosition)
    expect(entity.angle).toMatchObject(validAngle)
  })

  it('throws on invalid data', () => {
    expect(() => GmodEntity.from({ class: 'prop_physics' })).toThrow()
  })
})

describe('GmodPlayer', () => {
  it('parses valid data and composes the nested value classes', () => {
    const player = GmodPlayer.from(validPlayerInput)

    expect(player.steamID64).toBe(validPlayerInput.steamID64)
    expect(player.team.getName()).toBe('Staff')
    expect(player.customValues).toEqual({ level: 1 })
  })

  it('keeps provided customValues and optional fields', () => {
    const player = GmodPlayer.from({ ...validPlayerInput, connectTime: 10, ping: 20 })
    expect(player.customValues).toEqual({ level: 1 })
    expect(player.ping).toBe(20)
  })

  it('throws on invalid data', () => {
    expect(() => GmodPlayer.from({ ...validPlayerInput, steamID64: 'too-short' })).toThrow()
  })
})

describe('GmodServer', () => {
  it('parses valid data and maps playersList to GmodPlayer instances', () => {
    const server = GmodServer.from({
      hostname: 'My Server',
      ip: '127.0.0.1',
      port: 27015,
      map: 'gm_construct',
      players: 1,
      playersList: [validPlayerInput],
      maxPlayers: 16,
      gameMode: 'Sandbox',
      uptime: 120,
    })

    expect(server.playersList).toHaveLength(1)
    expect(server.playersList[0]).toBeInstanceOf(GmodPlayer)
  })

  it('throws on invalid data', () => {
    expect(() => GmodServer.from({ hostname: 'My Server' })).toThrow()
  })
})

describe('GmodScreenshot', () => {
  const validCapture = { w: 1920, h: 1080, x: 0, y: 0, quality: 80, format: 'jpeg' }

  it('parses valid data and defaults the title to undefined when absent', () => {
    const screenshot = GmodScreenshot.from({
      captureData: validCapture,
      player: validPlayerInput,
      screenshot: 'base64==',
      size: '10KB',
    })

    expect(screenshot.title).toBeUndefined()
    expect(screenshot.getTitle()).toBe('No Title')
  })

  it('keeps a provided title', () => {
    const screenshot = GmodScreenshot.from({
      captureData: validCapture,
      title: 'My Screenshot',
      player: validPlayerInput,
      screenshot: 'base64==',
      size: '10KB',
    })

    expect(screenshot.getTitle()).toBe('My Screenshot')
  })

  it('throws on invalid data', () => {
    expect(() => GmodScreenshot.from({ captureData: validCapture })).toThrow()
  })

  it('save() and sendToDiscord() are no-op stubs that resolve', async () => {
    const screenshot = GmodScreenshot.from({
      captureData: validCapture,
      player: validPlayerInput,
      screenshot: 'base64==',
      size: '10KB',
    })

    await expect(screenshot.save()).resolves.toBeUndefined()
    await expect(screenshot.sendToDiscord()).resolves.toBeUndefined()
  })
})
