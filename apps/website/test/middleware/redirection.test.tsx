import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../testUtils.js'
import RedirectMiddleware from '../../src/middleware/redirection.js'

afterEach(() => cleanup())

function renderAt(path: string) {
  const history = historyAt(path)
  renderWithProviders(() => <RedirectMiddleware />, { path: '*', history })
  return history
}

describe('middleware/redirection.tsx', () => {
  const originalLocation = window.location

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        origin: 'http://localhost:3000',
        protocol: 'http:',
        host: 'localhost:3000',
        hostname: 'localhost',
        href: 'http://localhost:3000/',
      },
      writable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation, writable: true })
  })

  it('does nothing for a path matching no redirect rule', () => {
    const history = renderAt('/dashboard/guilds')
    expect(history.get()).toBe('/dashboard/guilds')
  })

  it('navigates to a same-origin redirect target', async () => {
    const history = renderAt('/privacy')
    await vi.waitFor(() => expect(history.get()).toBe('/legal/privacy'))
  })

  it('sets window.location.href for an external redirect target', () => {
    renderAt('/invite')
    expect(window.location.href).toContain('discord.com/oauth2/authorize')
  })

  it('does not redirect again once already on the target path', () => {
    const history = renderAt('/legal/privacy')
    expect(history.get()).toBe('/legal/privacy')
  })

  it('only redirects an "exact" rule on an exact match, not a longer path', () => {
    // /dashboard is `exact: true` -> /dashboard/guilds/123 must NOT be treated as a match here
    // (it already looks like the guild dashboard route, unrelated to the exact /dashboard rule).
    const history = renderAt('/dashboard/guilds/123')
    expect(history.get()).toBe('/dashboard/guilds/123')
  })

  it('redirects an exact-match rule to its target', async () => {
    const history = renderAt('/dashboard')
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds'))
  })

  describe('/open safe-redirect handling', () => {
    it('redirects home when no link query param is present', () => {
      renderAt('/open')
      expect(window.location.href).toBe('/')
    })

    it('redirects home when the link query param is present but empty', () => {
      renderAt('/open?link=')
      expect(window.location.href).toBe('/')
    })

    it('redirects home when the decoded link fails to parse as a URL', () => {
      renderAt('/open?link=' + encodeURIComponent('http://['))
      expect(window.location.href).toBe('/')
    })

    it('redirects home when the link param fails to decode', () => {
      renderAt('/open?link=%E0%A4%A')
      expect(window.location.href).toBe('/')
    })

    it('redirects home when the decoded link uses a disallowed protocol', () => {
      renderAt('/open?link=' + encodeURIComponent('steam://connect/1.2.3.4:27015'))
      expect(window.location.href).toBe('/')
    })

    it('redirects to the decoded link when it is a safe http(s) URL', () => {
      renderAt('/open?link=' + encodeURIComponent('https://example.com/page'))
      expect(window.location.href).toBe('https://example.com/page')
    })

    it('resolves a relative link against the current origin', () => {
      renderAt('/open?link=' + encodeURIComponent('/some/relative/path'))
      expect(window.location.href).toBe('http://localhost:3000/some/relative/path')
    })
  })
})
