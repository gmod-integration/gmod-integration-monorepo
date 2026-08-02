import { describe, expect, it } from 'vitest'
import { firstString } from '../../src/utils/http.js'

describe('firstString', () => {
  it('returns the value directly when it is already a string', () => {
    expect(firstString('hello')).toBe('hello')
  })

  it('returns the first element when it is a string', () => {
    expect(firstString(['a', 'b'])).toBe('a')
  })

  it('returns undefined when the first array element is not a string', () => {
    expect(firstString([1, 2])).toBeUndefined()
  })

  it('returns undefined for other types', () => {
    expect(firstString(42)).toBeUndefined()
    expect(firstString(undefined)).toBeUndefined()
    expect(firstString(null)).toBeUndefined()
  })
})
