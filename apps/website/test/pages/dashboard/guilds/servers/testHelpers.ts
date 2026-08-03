import { vi } from 'vitest'

/**
 * happy-dom doesn't implement the browser's "named access on Window" feature (elements with an
 * `id` attribute becoming bare globals, e.g. `edit_format.showModal()`) that these pages' onClick
 * handlers rely on - it works in real browsers but throws a ReferenceError under happy-dom. Wire
 * the bare global by hand to the real rendered dialog element before triggering a click that
 * references it.
 */
export function stubDialogGlobal(container: HTMLElement, id: string): HTMLDialogElement {
  const el = container.querySelector(`#${id}`) as HTMLDialogElement | null
  if (!el) throw new Error(`stubDialogGlobal: no element with id "${id}" in container`)
  vi.spyOn(el, 'showModal')
  vi.spyOn(el, 'close')
  ;(globalThis as Record<string, unknown>)[id] = el
  return el
}

export function clearDialogGlobals(...ids: string[]) {
  for (const id of ids) {
    delete (globalThis as Record<string, unknown>)[id]
  }
}

export function okJson(data: unknown) {
  return { ok: true, json: async () => data }
}

export function errJson(data: unknown = {}) {
  return { ok: false, json: async () => data }
}
