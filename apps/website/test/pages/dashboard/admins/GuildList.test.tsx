import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../../../testUtils.js'
import GuildList from '../../../../src/pages/dashboard/admins/GuildList.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// GuildList.tsx's top-level return is a Fragment whose only child is a <Show>. In this test
// environment (duplicate solid-js copies installed - see `apps/website/node_modules/solid-js`
// vs the repo-root copy), mounting a Show as the direct/first child of the render root means the
// resource's loading->loaded signal update never reaches the DOM (verified with a minimal
// createSignal+Show repro with no resource/router involved at all - real app behavior is
// unaffected, wrapping the render call in a plain host <div> is enough to route around it).
function renderGuildList() {
  return renderWithProviders(() => (
    <div>
      <GuildList />
    </div>
  ))
}

describe('pages/dashboard/admins/GuildList.tsx', () => {
  it('shows a loading placeholder while the guild list resource is loading', () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}))
    vi.stubGlobal('fetch', fetchMock)

    renderGuildList()

    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
  })

  it.each(['http', 'network'])('distinguishes a %s failure from an empty list and allows retry', async (failure) => {
    const fetchMock = vi.fn()
    if (failure === 'http') fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 }))
    else fetchMock.mockRejectedValueOnce(new Error('Network unavailable'))
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            name: 'Recovered community',
            guild: 'g1',
            language: 'en',
            member: 5,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-02-01T00:00:00.000Z',
          },
        ]),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    renderGuildList()

    await vi.waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Unable to load the Discord communities.'),
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByText('No communities to display.')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await vi.waitFor(() => expect(screen.getByRole('heading', { name: 'Recovered community' })).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an empty state only after a successful response with no communities', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]')))
    renderGuildList()

    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No communities to display.'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('sorts guilds by member desc and renders every guild card field', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            name: 'Small Guild',
            guild: 'g1',
            language: 'en',
            member: 5,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-02-01T00:00:00.000Z',
          },
          {
            name: 'Big Guild',
            guild: 'g2',
            language: 'fr',
            member: 500,
            createdAt: '2024-03-01T00:00:00.000Z',
            updatedAt: '2024-04-01T00:00:00.000Z',
          },
        ]),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    renderGuildList()

    await vi.waitFor(() => expect(screen.getByText('Big Guild')).toBeInTheDocument())
    const titles = screen.getAllByRole('heading', { level: 2 })
    expect(titles.map((h) => h.textContent)).toEqual(['Big Guild', 'Small Guild'])
    expect(screen.getByText('g1')).toBeInTheDocument()
    expect(screen.getByText('en')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })
})
