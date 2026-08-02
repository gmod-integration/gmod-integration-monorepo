import { describe, expect, it } from 'vitest'
import { GmodAngle } from '../src/GmodAngle.js'
import { GmodCaptureData } from '../src/GmodCaptureData.js'
import { GmodPosition } from '../src/GmodPosition.js'
import { GmodTeam } from '../src/GmodTeam.js'
import { GmodWeapon } from '../src/GmodWeapon.js'

describe('GmodAngle', () => {
  it('parses valid data', () => {
    const angle = GmodAngle.from({ p: 1, y: 2, r: 3 })
    expect(angle).toMatchObject({ p: 1, y: 2, r: 3 })
  })

  it('throws on invalid data', () => {
    expect(() => GmodAngle.from({ p: 'not-a-number' })).toThrow()
  })
})

describe('GmodPosition', () => {
  it('parses valid data', () => {
    const position = GmodPosition.from({ x: 1, y: 2, z: 3 })
    expect(position).toMatchObject({ x: 1, y: 2, z: 3 })
  })

  it('throws on invalid data', () => {
    expect(() => GmodPosition.from({ x: 1 })).toThrow()
  })
})

describe('GmodTeam', () => {
  it('parses valid data and exposes getName/getID', () => {
    const team = GmodTeam.from({ id: 1, name: 'Police' })
    expect(team.getID()).toBe(1)
    expect(team.getName()).toBe('Police')
  })

  it('throws on invalid data', () => {
    expect(() => GmodTeam.from({ id: 'not-a-number', name: 'Police' })).toThrow()
  })
})

describe('GmodWeapon', () => {
  it('parses valid data', () => {
    const weapon = GmodWeapon.from({ class: 'weapon_physgun', printName: 'Physics Gun' })
    expect(weapon).toMatchObject({ class: 'weapon_physgun', printName: 'Physics Gun' })
  })

  it('throws on invalid data', () => {
    expect(() => GmodWeapon.from({ class: 'weapon_physgun' })).toThrow()
  })
})

describe('GmodCaptureData', () => {
  it('parses valid data', () => {
    const capture = GmodCaptureData.from({ w: 1920, h: 1080, x: 0, y: 0, quality: 80, format: 'jpeg' })
    expect(capture.format).toBe('jpeg')
  })

  it('throws on an invalid format', () => {
    expect(() => GmodCaptureData.from({ w: 1920, h: 1080, x: 0, y: 0, quality: 80, format: 'webp' })).toThrow()
  })
})
