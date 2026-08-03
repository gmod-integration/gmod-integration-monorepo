import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../../../../../testUtils.js'
import { Screenshot } from '../../../../../../src/pages/dashboard/guilds/servers/screenshots/Screenshot.js'
import type { ScreenshotStructure } from '../../../../../../src/pages/dashboard/guilds/servers/screenshots/ServerScreenshotList.js'

afterEach(() => {
  cleanup()
  delete (globalThis as Record<string, unknown>).focusImgModal
})

const baseShot: ScreenshotStructure = {
  id: 1,
  serverID: 's1',
  title: 'My Screenshot',
  player: { name: 'Bob', steamID64: '765123' },
  url: 'https://example.com/shot.png',
  createdAt: '1/1/2024, 12:00:00 AM',
  channelID: 'c1',
}

function renderShot(shot: ScreenshotStructure, setFocusImg = vi.fn()) {
  return { setFocusImg, ...renderWithProviders(() => <Screenshot screenshot={shot} setFocusImg={setFocusImg} />) }
}

describe('pages/dashboard/guilds/servers/screenshots/Screenshot.tsx', () => {
  beforeEach(() => {
    ;(globalThis as Record<string, unknown>).focusImgModal = { showModal: vi.fn() }
  })

  it('renders the title, image, and date/player metadata', () => {
    const { container } = renderShot(baseShot)
    expect(screen.getByText('My Screenshot')).toBeInTheDocument()
    const img = container.querySelector('img') as HTMLImageElement
    expect(img).toHaveAttribute('src', baseShot.url)
    expect(img).toHaveAttribute('alt', 'Screenshot')
    expect(container.textContent).toContain('1/1/2024')
    expect(container.textContent).toContain('Bob')
  })

  it('falls back to "No Title" when the title is empty', () => {
    renderShot({ ...baseShot, title: '' })
    expect(screen.getByText('No Title')).toBeInTheDocument()
  })

  it('falls back to "No Name" when the player name is empty', () => {
    renderShot({ ...baseShot, player: { name: '', steamID64: '765123' } })
    expect(screen.getByText('No Name', { exact: false })).toBeInTheDocument()
  })

  it('renders a SteamID64 link when steamID64 is present', () => {
    renderShot(baseShot)
    const link = screen.getByRole('link', { name: '765123' }) as HTMLAnchorElement
    expect(link).toHaveAttribute('href', 'https://steamcommunity.com/profiles/765123')
  })

  it('shows "No Steam ID" text when steamID64 is empty', () => {
    renderShot({ ...baseShot, player: { name: 'Bob', steamID64: '' } })
    expect(screen.getByText('No Steam ID', { exact: false })).toBeInTheDocument()
  })

  it('hides player metadata entirely when player is null', () => {
    const { container } = renderShot({ ...baseShot, player: null })
    expect(container.textContent).not.toContain('Bob')
  })

  it('calls setFocusImg and opens the modal when the image is clicked', async () => {
    const { container, setFocusImg } = renderShot(baseShot)
    await fireEvent.click(container.querySelector('img') as HTMLImageElement)
    expect(setFocusImg).toHaveBeenCalledWith(baseShot)
    expect((globalThis as Record<string, { showModal: () => void }>).focusImgModal.showModal).toHaveBeenCalled()
  })

  it('calls setFocusImg and opens the modal via the View button', async () => {
    const { setFocusImg } = renderShot(baseShot)
    await fireEvent.click(screen.getByRole('button', { name: 'View Screenshot' }))
    expect(setFocusImg).toHaveBeenCalledWith(baseShot)
  })

  it('renders an "Open in new tab" link pointing at the screenshot url', () => {
    renderShot(baseShot)
    const link = screen.getByRole('link', { name: 'Open in new tab' })
    expect(link).toHaveAttribute('href', baseShot.url)
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('copies the screenshot url to the clipboard when the copy button is clicked', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    renderShot(baseShot)
    await fireEvent.click(screen.getByRole('button', { name: 'Copy URL' }))
    expect(writeText).toHaveBeenCalledWith(baseShot.url)
    writeText.mockRestore()
  })
})
