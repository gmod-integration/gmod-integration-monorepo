import { describe, expect, it } from 'vitest'
import { hasJSONBudget, type JSONBudget } from '../src/jsonBudget.js'
const budget: JSONBudget = {
  maxDepth: 4,
  maxNodes: 20,
  maxArrayLength: 5,
  maxObjectKeys: 5,
  maxStringLength: 20,
  maxCharacters: 50,
}
describe('JSON structural budget', () => {
  it('accepts bounded JSON including null-prototype query objects', () => {
    expect(hasJSONBudget({ array: [null, true, 1, 'ok'] }, budget)).toBe(true)
    expect(hasJSONBudget(Object.assign(Object.create(null), { query: 'safe' }), budget)).toBe(true)
  })
  it('rejects oversized arrays before inspecting their children', () => {
    const array = new Array(6)
    Object.defineProperty(array, '0', {
      get: () => {
        throw new Error('Must not inspect')
      },
    })
    expect(hasJSONBudget(array, budget)).toBe(false)
  })
  it('bounds nesting, node count, object keys, individual strings and total text', () => {
    for (const value of [
      Array.from({ length: 5 }, () => [1, 2, 3, 4, 5]),
      { a: { b: { c: { d: { e: 0 } } } } },
      Object.fromEntries(Array.from({ length: 6 }, (_, i) => [i, 1])),
      'x'.repeat(21),
      ['x'.repeat(20), 'x'.repeat(20), 'x'.repeat(20)],
    ])
      expect(hasJSONBudget(value, budget)).toBe(false)
  })
  it('rejects prototype keys, cycles and non-JSON values', () => {
    const cycle: unknown[] = []
    cycle.push(cycle)
    for (const value of [
      JSON.parse('{"__proto__":{}}'),
      { constructor: 1 },
      { prototype: true },
      cycle,
      new Date(),
      undefined,
      Infinity,
      () => 1,
    ])
      expect(hasJSONBudget(value, budget)).toBe(false)
  })
})
