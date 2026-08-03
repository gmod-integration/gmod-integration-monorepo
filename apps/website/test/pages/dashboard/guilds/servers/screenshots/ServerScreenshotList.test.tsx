import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../../../../../testUtils.js'
import { okJson } from '../testHelpers.js'

vi.mock('../../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(() => Promise.resolve({ ok: true, json: async () => [] })),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

const { fetchAPI } = await import('../../../../../../src/utils/api.js')
const { ServerScreenshotList } = await import(
  '../../../../../../src/pages/dashboard/guilds/servers/screenshots/ServerScreenshotList.js'
)

const SCREENSHOTS_URL_PREFIX = '/users/:discordID/guilds/:guildID/servers/:serverID/screenshots?'

// happy-dom's IntersectionObserver stub fires its callback with isIntersecting: true as soon as
// `.observe()` is called (it doesn't model real layout/geometry), so without stubbing it out the
// sentinel's observer re-triggers loadPage() on every DOM update once mounted.
class InertIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('IntersectionObserver', InertIntersectionObserver)

// happy-dom's `getBoundingClientRect()` doesn't compute real layout either, and the source's own
// `checkForMore` (re-scheduled via `requestAnimationFrame` after every `loadPage()` completes)
// reads `sentinel.getBoundingClientRect().top` to decide whether to load another page - with
// happy-dom's default all-zero rect, `0 < window.innerHeight + 200` is always true, so it loads
// pages in an unbounded loop. Defaulting the stub to a rect far below the viewport keeps that
// rAF-driven re-check a no-op; the scroll test below temporarily reports a near-viewport rect to
// drive its explicit "user scrolled near the bottom" case instead.
let sentinelNearViewport = false
vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
  () =>
    ({
      top: sentinelNearViewport ? 0 : 999999,
      bottom: 0,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON() {},
    }) as DOMRect,
)

afterEach(() => {
  cleanup()
  sentinelNearViewport = false
})

function shot(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    serverID: 's1',
    title: 'Shot',
    player: JSON.stringify({ name: 'Bob', steamID64: '765123' }),
    url: 'https://example.com/1.png',
    createdAt: '2024-01-01T00:00:00.000Z',
    channelID: 'c1',
    captureData: JSON.stringify({ x: 0, y: 0, w: 1, h: 1, quality: 1, format: 'png' }),
    ...overrides,
  }
}

function page(items: unknown[]) {
  return { screenshots: items, query: { total: items.length } }
}

function renderPage() {
  return renderWithProviders(() => <ServerScreenshotList />)
}

describe('pages/dashboard/guilds/servers/screenshots/ServerScreenshotList.tsx', () => {
  beforeEach(() => {
    ;(fetchAPI as Mock).mockReset()
  })

  it('fetches the first page on mount with offset 0', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(okJson(page([])))
    renderPage()
    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith(
        `${SCREENSHOTS_URL_PREFIX}offset=0&limit=20&sort=createdAt&orderBy=DESC`,
        'GET',
      ),
    )
  })

  it('renders fetched screenshots, parsing player and captureData JSON strings', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(okJson(page([shot()])))
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('Shot')).toBeInTheDocument())
    expect(screen.getByText('Bob', { exact: false })).toBeInTheDocument()
  })

  it('sets player to null when the player JSON is invalid', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(okJson(page([shot({ player: 'not-json' })])))
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByText('Shot')).toBeInTheDocument())
    // player parse failure -> null -> the player/steamID <Show> block doesn't render
    expect(container.textContent).not.toContain('Bob')
  })

  it('sets player to null when the player field is falsy', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(okJson(page([shot({ player: '' })])))
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByText('Shot')).toBeInTheDocument())
    expect(container.textContent).not.toContain('Player')
  })

  it('sets captureData to null when the captureData JSON is invalid, without throwing', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(okJson(page([shot({ captureData: 'not-json' })])))
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('Shot')).toBeInTheDocument())
  })

  it('sets captureData to null when the captureData field is falsy', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(okJson(page([shot({ captureData: undefined })])))
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('Shot')).toBeInTheDocument())
  })

  it('shows the loading spinner while a page is loading', () => {
    ;(fetchAPI as Mock).mockReturnValue(new Promise(() => {}))
    const { container } = renderPage()
    expect(container.querySelector('.loading-spinner')).toBeInTheDocument()
  })

  it('shows the end-of-list message once a short page indicates no more results', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(okJson(page([shot()])))
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('End of List')).toBeInTheDocument())
  })

  it('does not show the end-of-list message while more pages remain', async () => {
    const fullPage = Array.from({ length: 20 }, (_, i) => shot({ id: i }))
    ;(fetchAPI as Mock).mockResolvedValue(okJson(page(fullPage)))
    renderPage()
    await vi.waitFor(() => expect(screen.getAllByText('Shot').length).toBe(20))
    expect(screen.queryByText('End of List')).not.toBeInTheDocument()
  })

  it('loads a second page on scroll, appending items and advancing the offset', async () => {
    const firstPage = Array.from({ length: 20 }, (_, i) => shot({ id: i, title: `Shot ${i}` }))
    const secondPage = [shot({ id: 100, title: 'Shot 100' })]
    ;(fetchAPI as Mock)
      .mockResolvedValueOnce(okJson(page(firstPage)))
      .mockResolvedValueOnce(okJson(page(secondPage)))
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('Shot 0')).toBeInTheDocument())

    sentinelNearViewport = true
    await fireEvent.scroll(window)
    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith(
        `${SCREENSHOTS_URL_PREFIX}offset=20&limit=20&sort=createdAt&orderBy=DESC`,
        'GET',
      ),
    )
    await vi.waitFor(() => expect(screen.getByText('Shot 100')).toBeInTheDocument())
  })

  it('logs an error and stops loading when the fetch response is not ok', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(fetchAPI as Mock).mockResolvedValue({ ok: false, json: async () => ({}) })
    const { container } = renderPage()
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled())
    expect(container.querySelector('.loading-spinner')).not.toBeInTheDocument()
    errorSpy.mockRestore()
  })

  it('opens the FocusImg modal with the clicked screenshot', async () => {
    ;(globalThis as Record<string, unknown>).focusImgModal = { showModal: vi.fn() }
    ;(fetchAPI as Mock).mockResolvedValue(okJson(page([shot()])))
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByText('Shot')).toBeInTheDocument())
    await fireEvent.click(container.querySelector('img') as HTMLImageElement)
    await vi.waitFor(() => expect(screen.getByText('Information')).toBeInTheDocument())
    delete (globalThis as Record<string, unknown>).focusImgModal
  })

  it('invokes the IntersectionObserver callback and loads more when intersecting', async () => {
    class FakeIntersectionObserver {
      static instances: FakeIntersectionObserver[] = []
      callback: (entries: { isIntersecting: boolean }[]) => void
      disconnect = vi.fn()
      observe = vi.fn()
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        this.callback = callback
        FakeIntersectionObserver.instances.push(this)
      }
    }
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)

    const firstPage = Array.from({ length: 20 }, (_, i) => shot({ id: i, title: `Shot ${i}` }))
    const secondPage = [shot({ id: 200, title: 'Shot 200' })]
    ;(fetchAPI as Mock)
      .mockResolvedValueOnce(okJson(page(firstPage)))
      .mockResolvedValueOnce(okJson(page(secondPage)))
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('Shot 0')).toBeInTheDocument())

    const observer = FakeIntersectionObserver.instances[0]
    observer.callback([{ isIntersecting: true }])
    await vi.waitFor(() => expect(screen.getByText('Shot 200')).toBeInTheDocument())

    vi.unstubAllGlobals()
  })

  it('does not load more when the IntersectionObserver entry is not intersecting', async () => {
    class FakeIntersectionObserver {
      static instances: FakeIntersectionObserver[] = []
      callback: (entries: { isIntersecting: boolean }[]) => void
      disconnect = vi.fn()
      observe = vi.fn()
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        this.callback = callback
        FakeIntersectionObserver.instances.push(this)
      }
    }
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)

    ;(fetchAPI as Mock).mockResolvedValue(okJson(page([shot()])))
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('Shot')).toBeInTheDocument())
    const callsBefore = (fetchAPI as Mock).mock.calls.length

    const observer = FakeIntersectionObserver.instances[0]
    observer.callback([{ isIntersecting: false }])
    expect((fetchAPI as Mock).mock.calls.length).toBe(callsBefore)

    vi.unstubAllGlobals()
  })

  it('disconnects the observer and removes the scroll listener on unmount', async () => {
    class FakeIntersectionObserver {
      static instances: FakeIntersectionObserver[] = []
      disconnect = vi.fn()
      observe = vi.fn()
      constructor(public callback: unknown) {
        FakeIntersectionObserver.instances.push(this)
      }
    }
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    ;(fetchAPI as Mock).mockResolvedValue(okJson(page([shot()])))
    const { unmount } = renderPage()
    await vi.waitFor(() => expect(screen.getByText('Shot')).toBeInTheDocument())
    unmount()

    expect(FakeIntersectionObserver.instances[0].disconnect).toHaveBeenCalled()
    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function))

    removeSpy.mockRestore()
    vi.unstubAllGlobals()
  })
})
