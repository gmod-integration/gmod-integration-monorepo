import { describe, expect, it } from 'vitest'
import { convertSecToTime } from '../../src/utils/convertSecToTime.js'

describe('utils/convertSecToTime.ts', () => {
  it('formats a full duration across weeks/days/hours/minutes/seconds', () => {
    const seconds = 1 * 604800 + 2 * 86400 + 3 * 3600 + 4 * 60 + 5
    expect(convertSecToTime(seconds, false, ['w', 'd', 'h', 'm', 's'])).toBe('01w 02d 03h 04m 05s')
  })

  it('omits zero-value units by default (force=false)', () => {
    expect(convertSecToTime(65, false, ['w', 'd', 'h', 'm', 's'])).toBe('01m 05s')
  })

  it('includes zero-value units when force is true', () => {
    expect(convertSecToTime(65, true, ['w', 'd', 'h', 'm', 's'])).toBe('00w 00d 00h 01m 05s')
  })

  it('only computes the requested units', () => {
    expect(convertSecToTime(3661, false, ['h', 'm'])).toBe('01h 01m')
  })

  it('defaults force to false and formatDate to the full unit set when omitted', () => {
    expect(convertSecToTime(65, undefined as any, undefined as any)).toBe('01m 05s')
  })

  it('returns an empty string for zero seconds with force=false', () => {
    expect(convertSecToTime(0, false, ['h', 'm', 's'])).toBe('')
  })
})
