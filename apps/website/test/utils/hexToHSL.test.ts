import { describe, expect, it } from 'vitest'
import { hexToHSL } from '../../src/utils/hexToHSL.js'

describe('utils/hexToHSL.ts', () => {
  it('converts pure red', () => {
    expect(hexToHSL('#ff0000')).toEqual({ h: 0, s: 100, l: 50 })
  })

  it('converts pure green (max === g branch)', () => {
    expect(hexToHSL('#00ff00')).toEqual({ h: 120, s: 100, l: 50 })
  })

  it('converts pure blue (max === b branch)', () => {
    expect(hexToHSL('#0000ff')).toEqual({ h: 240, s: 100, l: 50 })
  })

  it('converts an achromatic gray (max === min branch)', () => {
    expect(hexToHSL('#808080')).toEqual({ h: 0, s: 0, l: 50 })
  })

  it('tolerates a hex string without a leading #', () => {
    expect(hexToHSL('ff0000')).toEqual({ h: 0, s: 100, l: 50 })
  })

  it('wraps the hue into the positive range when max is red and green < blue', () => {
    // r=255,g=0,b=128 -> hits the `(g < b ? 6 : 0)` wrap-around branch of the red-max hue calc.
    const result = hexToHSL('#ff0080')
    expect(result.h).toBe(330)
  })

  it('takes the saturation branch for lightness > 0.5', () => {
    // A light, low-saturation blue: lightness > 0.5 uses the `d / (2 - max - min)` formula.
    const result = hexToHSL('#a0a0ff')
    expect(result.l).toBeGreaterThan(50)
    expect(result.h).toBe(240)
  })
})
