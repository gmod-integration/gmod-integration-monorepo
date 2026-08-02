import { describe, expect, it } from 'vitest'
import { Angle } from '../../../src/classes/v3/Angle.js'
import { Position } from '../../../src/classes/v3/Position.js'
import { Team } from '../../../src/classes/v3/Team.js'
import { CustomValues } from '../../../src/classes/v3/CustomValues.js'

describe('Angle', () => {
  it('parses a full angle', () => {
    const angle = new Angle({ p: 1, y: 2, r: 3 })
    expect(angle).toMatchObject({ p: 1, y: 2, r: 3 })
  })

  it('defaults each falsy field to 0', () => {
    const angle = new Angle({ p: 0, y: 0, r: 0 })
    expect(angle).toMatchObject({ p: 0, y: 0, r: 0 })
  })

  it('throws when a required field is missing', () => {
    expect(() => new Angle({ p: 1, y: 2 } as any)).toThrow('Missing key: r')
  })

  it('does not throw when throwMissing is false, even with missing fields', () => {
    expect(() => new Angle({} as any, false)).not.toThrow()
  })
})

describe('Position', () => {
  it('parses a full position', () => {
    const position = new Position({ x: 1, y: 2, z: 3 })
    expect(position).toMatchObject({ x: 1, y: 2, z: 3 })
  })

  it('defaults each falsy field to 0', () => {
    const position = new Position({ x: 0, y: 0, z: 0 })
    expect(position).toMatchObject({ x: 0, y: 0, z: 0 })
  })

  it('throws when a required field is missing', () => {
    expect(() => new Position({ x: 1, y: 2 } as any)).toThrow('Missing key: z')
  })

  it('does not throw when throwMissing is false, even with missing fields', () => {
    expect(() => new Position({} as any, false)).not.toThrow()
  })
})

describe('Team', () => {
  it('parses a team and exposes getName/getID', () => {
    const team = new Team({ id: 1, name: 'Red' })
    expect(team.getName()).toBe('Red')
    expect(team.getID()).toBe(1)
  })

  it('throws when a required field is missing', () => {
    expect(() => new Team({ id: 1 } as any)).toThrow('Missing key: name')
  })

  it('does not throw when throwMissing is false, even with missing fields', () => {
    expect(() => new Team({} as any, false)).not.toThrow()
  })
})

describe('CustomValues', () => {
  it('copies every key from the input object', () => {
    const values = new CustomValues({ a: '1', b: '2' })
    expect(values.a).toBe('1')
    expect(values.b).toBe('2')
  })

  it('isValid always returns true', () => {
    const values = new CustomValues({})
    expect(values.isValid()).toBe(true)
  })
})
