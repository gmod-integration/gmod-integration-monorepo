import { describe, expect, it } from 'vitest'
import { getSingleParam } from '../../src/utils/requestParams.js'

describe('getSingleParam', () => {
  it('returns the first element of an array', () => {
    expect(getSingleParam(['a', 'b'])).toBe('a')
  })

  it('returns an empty string when the array is empty', () => {
    expect(getSingleParam([])).toBe('')
  })

  it('returns the value unchanged when it is already a string', () => {
    expect(getSingleParam('a')).toBe('a')
  })
})
