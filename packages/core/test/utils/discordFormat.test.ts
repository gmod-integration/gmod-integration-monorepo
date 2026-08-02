import { describe, expect, it } from 'vitest'
import { dateToDiscordTimestamp, secToTime } from '../../src/utils/discordFormat.js'

describe('dateToDiscordTimestamp', () => {
  it('formats a date as a relative Discord timestamp', () => {
    const date = new Date('2026-01-01T00:00:00.000Z')
    expect(dateToDiscordTimestamp(date)).toBe(`<t:${Math.floor(date.getTime() / 1000)}:R>`)
  })
})

describe('secToTime', () => {
  it('formats weeks, days, hours, minutes, and seconds', () => {
    const sec = 1 * 604800 + 2 * 86400 + 3 * 3600 + 4 * 60 + 5
    expect(secToTime(sec)).toBe('1w 2d 3h 4m 5s')
  })

  it('omits zero-valued units', () => {
    expect(secToTime(65)).toBe('1m 5s')
  })

  it('returns an empty string for zero seconds', () => {
    expect(secToTime(0)).toBe('')
  })

  it('truncates to the requested precision', () => {
    const sec = 1 * 604800 + 2 * 86400 + 3 * 3600
    expect(secToTime(sec, 2)).toBe('1w 2d')
  })
})
