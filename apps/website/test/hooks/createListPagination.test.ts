import { createRoot, createSignal } from 'solid-js'
import { afterEach, describe, expect, it } from 'vitest'
import { createListPagination } from '../../src/hooks/createListPagination.js'

const disposals: Array<() => void> = []
afterEach(() => disposals.splice(0).forEach((dispose) => dispose()))
function setup<T>(source: T[], resetKey?: () => unknown) {
  return createRoot((dispose) => {
    disposals.push(dispose)
    const [items, setItems] = createSignal<readonly T[] | undefined>(source)
    const pages = createListPagination(items, { resetKey })
    return { pages, setItems }
  })
}
const rows = (length: number) => Array.from({ length }, (_, index) => index + 1)

describe('loaded-list pagination', () => {
  it('displays a slice while retaining the full total, including the last partial page', () => {
    const { pages } = setup(rows(62))
    expect(pages.items()).toEqual(rows(25))
    expect(pages.total()).toBe(62)
    expect(pages.visible()).toBe(true)
    pages.onChange({ ...pages.query(), offset: 25 })
    expect(pages.items()).toEqual(rows(50).slice(25))
    pages.onChange({ ...pages.query(), offset: 50 })
    expect(pages.items()).toEqual(rows(62).slice(50))
  })

  it('resets the page on size changes and ignores unsupported sizes', () => {
    const { pages } = setup(rows(80))
    pages.onChange({ ...pages.query(), offset: 50 })
    pages.onChange({ ...pages.query(), limit: 50 })
    expect(pages.query()).toMatchObject({ limit: 50, offset: 0 })
    expect(pages.items()).toHaveLength(50)
    pages.onChange({ ...pages.query(), limit: 3 })
    expect(pages.query().limit).toBe(50)
  })

  it('clamps a removed last page and keeps the corrected page when records are added', () => {
    const { pages, setItems } = setup(rows(51))
    pages.onChange({ ...pages.query(), offset: 50 })
    setItems(rows(50))
    expect(pages.query().offset).toBe(25)
    expect(pages.items()).toEqual(rows(50).slice(25))
    setItems(rows(60))
    expect(pages.query().offset).toBe(25)
  })

  it('returns to the first page when the search changes, even if result counts stay equal', () => {
    const { pages, setSearch } = createRoot((dispose) => {
      disposals.push(dispose)
      const [search, setSearch] = createSignal('old')
      const pages = createListPagination(() => rows(60), { resetKey: search })
      return { pages, setSearch }
    })
    pages.onChange({ ...pages.query(), offset: 50 })
    setSearch('new')
    expect(pages.query().offset).toBe(0)
  })

  it('handles empty and unavailable data and sanitizes invalid offsets without modifying the source', () => {
    const original = rows(30)
    const { pages, setItems } = setup(original)
    pages.onChange({ ...pages.query(), offset: Infinity })
    expect(pages.query().offset).toBe(0)
    pages.onChange({ ...pages.query(), offset: 31.5 })
    expect(pages.query().offset).toBe(25)
    expect(original).toHaveLength(30)
    setItems(undefined)
    expect(pages.items()).toEqual([])
    setItems([])
    expect(pages.query().offset).toBe(0)
    expect(pages.visible()).toBe(false)
  })

  it('keeps two list pagers independent', () => {
    const first = setup(rows(60)).pages
    const second = setup(rows(40)).pages
    first.onChange({ ...first.query(), offset: 50 })
    expect(second.query().offset).toBe(0)
    second.onChange({ ...second.query(), limit: 50 })
    expect(first.query()).toMatchObject({ limit: 25, offset: 50 })
  })

  it('keeps malformed legacy list responses from crashing a paginated view', () => {
    const { pages, setItems } = setup(rows(30))
    setItems({} as readonly number[])
    expect(pages.items()).toEqual([])
    expect(pages.total()).toBe(0)
    expect(pages.visible()).toBe(false)
  })
})
