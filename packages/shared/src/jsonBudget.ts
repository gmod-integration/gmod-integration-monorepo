export interface JSONBudget {
  maxDepth: number
  maxNodes: number
  maxArrayLength: number
  maxObjectKeys: number
  maxStringLength: number
  maxCharacters: number
}

/** Inspect JSON before a recursive validator allocates per-entry errors or clones large collections. */
export function hasJSONBudget(value: unknown, budget: JSONBudget): boolean {
  const pending = [{ value, depth: 0 }]
  const seen = new Set<object>()
  let nodes = 0
  let characters = 0
  while (pending.length) {
    const entry = pending.pop()!
    if (++nodes > budget.maxNodes || entry.depth > budget.maxDepth) return false
    const current = entry.value
    if (current === null || typeof current === 'boolean') continue
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) return false
      continue
    }
    if (typeof current === 'string') {
      characters += current.length
      if (current.length > budget.maxStringLength || characters > budget.maxCharacters) return false
      continue
    }
    if (typeof current !== 'object' || seen.has(current)) return false
    seen.add(current)
    if (Array.isArray(current)) {
      if (current.length > budget.maxArrayLength) return false
      for (const child of current) pending.push({ value: child, depth: entry.depth + 1 })
    } else {
      if (![Object.prototype, null].includes(Object.getPrototypeOf(current))) return false
      const keys = Object.keys(current)
      if (keys.length > budget.maxObjectKeys) return false
      for (const key of keys) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') return false
        characters += key.length
        if (characters > budget.maxCharacters) return false
        pending.push({ value: (current as Record<string, unknown>)[key], depth: entry.depth + 1 })
      }
    }
  }
  return true
}
