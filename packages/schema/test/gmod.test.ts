import { describe, expect, it } from 'vitest'
import { GmodAngleSchema } from '../src/gmod/GmodAngleSchema.js'
import { GmodCaptureDataSchema } from '../src/gmod/GmodCaptureDataSchema.js'
import { GmodEntitySchema } from '../src/gmod/GmodEntitySchema.js'
import { GmodErrorsSchema } from '../src/gmod/GmodErrorsSchema.js'
import { GmodPlayerSchema, GmodPlayersListSchema } from '../src/gmod/GmodPlayerSchema.js'
import { GmodPositionSchema } from '../src/gmod/GmodPositionSchema.js'
import { GmodScreenshotSchema } from '../src/gmod/GmodScreenshotSchema.js'
import { GmodServerSchema } from '../src/gmod/GmodServerSchema.js'
import { GmodTeamSchema } from '../src/gmod/GmodTeamSchema.js'
import { GmodWeaponSchema } from '../src/gmod/GmodWeaponSchema.js'

const validPosition = { x: 1, y: 2, z: 3 }
const validAngle = { p: 0, y: 90, r: 180 }
const validTeam = { id: 1, name: 'Staff' }
const validWeapon = { class: 'weapon_physgun', printName: 'Physics Gun' }

const validPlayer = {
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

describe('GmodPositionSchema', () => {
  it('parses a valid position', () => {
    expect(GmodPositionSchema.parse(validPosition)).toEqual(validPosition)
  })

  it('rejects a position missing a coordinate', () => {
    const { z: _z, ...rest } = validPosition
    expect(GmodPositionSchema.safeParse(rest).success).toBe(false)
  })
})

describe('GmodAngleSchema', () => {
  it('parses a valid angle', () => {
    expect(GmodAngleSchema.parse(validAngle)).toEqual(validAngle)
  })

  it('rejects a non-numeric angle field', () => {
    expect(GmodAngleSchema.safeParse({ ...validAngle, p: 'not-a-number' }).success).toBe(false)
  })
})

describe('GmodTeamSchema', () => {
  it('parses a valid team', () => {
    expect(GmodTeamSchema.parse(validTeam)).toEqual(validTeam)
  })

  it('rejects a team missing a name', () => {
    const { name: _name, ...rest } = validTeam
    expect(GmodTeamSchema.safeParse(rest).success).toBe(false)
  })
})

describe('GmodWeaponSchema', () => {
  it('parses a valid weapon', () => {
    expect(GmodWeaponSchema.parse(validWeapon)).toEqual(validWeapon)
  })

  it('rejects a weapon missing a class', () => {
    const { class: _class, ...rest } = validWeapon
    expect(GmodWeaponSchema.safeParse(rest).success).toBe(false)
  })
})

describe('GmodPlayerSchema', () => {
  it('parses a valid player', () => {
    expect(GmodPlayerSchema.parse(validPlayer)).toMatchObject({ steamID64: validPlayer.steamID64 })
  })

  it('accepts optional fields when provided', () => {
    const withOptional = { ...validPlayer, connectTime: 10, adjustedTime: 5, ping: 20, fps: 60 }
    expect(GmodPlayerSchema.parse(withOptional)).toMatchObject({ ping: 20 })
  })

  it('rejects a steamID64 that is not exactly 17 characters', () => {
    expect(GmodPlayerSchema.safeParse({ ...validPlayer, steamID64: 'too-short' }).success).toBe(false)
  })

  it('rejects an empty name', () => {
    expect(GmodPlayerSchema.safeParse({ ...validPlayer, name: '' }).success).toBe(false)
  })

  it('rejects an unknown branch value', () => {
    expect(GmodPlayerSchema.safeParse({ ...validPlayer, branch: 'stable' }).success).toBe(false)
  })

  it('rejects a player missing required nested data', () => {
    const { team: _team, ...rest } = validPlayer
    expect(GmodPlayerSchema.safeParse(rest).success).toBe(false)
  })
})

describe('GmodPlayersListSchema', () => {
  it('parses a list of valid players', () => {
    expect(GmodPlayersListSchema.parse([validPlayer])).toHaveLength(1)
  })

  it('rejects a non-array value', () => {
    expect(GmodPlayersListSchema.safeParse(validPlayer).success).toBe(false)
  })
})

describe('GmodEntitySchema', () => {
  const validEntity = {
    class: 'prop_physics',
    model: 'models/props_c17/oildrum001.mdl',
    position: validPosition,
    angle: validAngle,
  }

  it('parses a valid entity', () => {
    expect(GmodEntitySchema.parse(validEntity)).toMatchObject({ class: validEntity.class })
  })

  it('rejects an entity with an invalid nested position', () => {
    expect(GmodEntitySchema.safeParse({ ...validEntity, position: { x: 1 } }).success).toBe(false)
  })
})

describe('GmodCaptureDataSchema', () => {
  const validCapture = { w: 1920, h: 1080, x: 0, y: 0, quality: 80, format: 'jpeg' }

  it('parses a valid capture', () => {
    expect(GmodCaptureDataSchema.parse(validCapture)).toEqual(validCapture)
  })

  it('accepts the other allowed format', () => {
    expect(GmodCaptureDataSchema.parse({ ...validCapture, format: 'png' }).format).toBe('png')
  })

  it('rejects an unsupported format', () => {
    expect(GmodCaptureDataSchema.safeParse({ ...validCapture, format: 'webp' }).success).toBe(false)
  })
})

describe('GmodScreenshotSchema', () => {
  const validCapture = { w: 1920, h: 1080, x: 0, y: 0, quality: 80, format: 'jpeg' }
  const validScreenshot = {
    captureData: validCapture,
    screenshot: 'base64==',
    size: '10KB',
  }

  it('parses a valid screenshot without the optional fields', () => {
    expect(GmodScreenshotSchema.parse(validScreenshot)).toMatchObject({ size: '10KB' })
  })

  it('accepts the optional title and player fields', () => {
    const withOptional = { ...validScreenshot, title: 'My Screenshot', player: validPlayer }
    expect(GmodScreenshotSchema.parse(withOptional)).toMatchObject({ title: 'My Screenshot' })
  })

  it('rejects a screenshot missing the capture data', () => {
    const { captureData: _captureData, ...rest } = validScreenshot
    expect(GmodScreenshotSchema.safeParse(rest).success).toBe(false)
  })
})

describe('GmodServerSchema', () => {
  const validServer = {
    hostname: 'My Server',
    ip: '127.0.0.1',
    port: 27015,
    map: 'gm_construct',
    players: 1,
    playersList: [validPlayer],
    maxPlayers: 16,
    gameMode: 'Sandbox',
    uptime: 120,
  }

  it('parses a valid server snapshot', () => {
    expect(GmodServerSchema.parse(validServer)).toMatchObject({ hostname: 'My Server' })
  })

  it('rejects a server snapshot missing a hostname', () => {
    const { hostname: _hostname, ...rest } = validServer
    expect(GmodServerSchema.safeParse(rest).success).toBe(false)
  })
})

describe('GmodErrorsSchema', () => {
  const validErrors = {
    error: 'attempt to index a nil value',
    stack: 'stack traceback: ...',
    realm: 'server',
    uptime: 3600,
    count: 1,
    serverID: 'server_123',
  }

  it('parses valid errors without the optional fields', () => {
    expect(GmodErrorsSchema.parse(validErrors)).toMatchObject({ serverID: 'server_123' })
  })

  it('accepts the optional fields when provided', () => {
    const withOptional = { ...validErrors, name: 'wsid', steamID64: '76561198219049673', workshopID: '123' }
    expect(GmodErrorsSchema.parse(withOptional)).toMatchObject({ name: 'wsid' })
  })

  it('rejects an unknown realm', () => {
    expect(GmodErrorsSchema.safeParse({ ...validErrors, realm: 'browser' }).success).toBe(false)
  })
})
