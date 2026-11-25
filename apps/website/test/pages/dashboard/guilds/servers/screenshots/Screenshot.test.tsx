import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../../../../../testUtils.js'
import { Screenshot } from '../../../../../../src/pages/dashboard/guilds/servers/screenshots/Screenshot.js'
import type { ScreenshotStructure } from '../../../../../../src/pages/dashboard/guilds/servers/screenshots/ServerScreenshotList.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const baseShot: ScreenshotStructure = {
  id: 1,
  serverID: 's1',
  title: 'My Screenshot',
  player: { name: 'Bob', steamID64: '765123' },
  url: 'https://example.com/shot.png',
  createdAt: '2024-01-01T00:00:00.000Z',
  channelID: 'c1',
}

function renderShot(shot: ScreenshotStructure, setFocusImg = vi.fn()) {
  return {
    setFocusImg,
    ...renderWithProviders(() => (
      <>
        <dialog id="focusImgModal"></dialog>
        <Screenshot screenshot={shot} setFocusImg={setFocusImg} />
      </>
    )),
  }
}

describe('pages/dashboard/guilds/servers/screenshots/Screenshot.tsx', () => {
  it('renders the title, image, and date/player metadata', () => {
    const { container } = renderShot(baseShot)
    expect(screen.getByText('My Screenshot')).toBeInTheDocument()
    const img = container.querySelector('img') as HTMLImageElement
    expect(img).toHaveAttribute('src', baseShot.url)
    expect(img).toHaveAttribute('alt', 'Game screenshot')
    expect(container.querySelector('time')).toHaveAttribute('datetime', baseShot.createdAt)
    expect(container.textContent).toContain('Bob')
  })

  it('falls back to "No Title" when the title is empty', () => {
    renderShot({ ...baseShot, title: '' })
    expect(screen.getByText('Untitled screenshot')).toBeInTheDocument()
  })

  it('falls back to "No Name" when the player name is empty', () => {
    renderShot({ ...baseShot, player: { name: '', steamID64: '765123' } })
    expect(screen.getByText('Player name unavailable', { exact: false })).toBeInTheDocument()
  })

  it('renders a SteamID64 link when steamID64 is present', () => {
    renderShot(baseShot)
    const link = screen.getByRole('link', { name: '765123' }) as HTMLAnchorElement
    expect(link).toHaveAttribute('href', 'https://steamcommunity.com/profiles/765123')
  })

  it('shows "No Steam ID" text when steamID64 is empty', () => {
    renderShot({ ...baseShot, player: { name: 'Bob', steamID64: '' } })
    expect(screen.getByText('SteamID64 unavailable', { exact: false })).toBeInTheDocument()
  })

  it('hides player metadata entirely when player is null', () => {
    const { container } = renderShot({ ...baseShot, player: null })
    expect(container.textContent).not.toContain('Bob')
  })

  it('calls setFocusImg and opens the modal when the image is clicked', async () => {
    const { container, setFocusImg } = renderShot(baseShot)
    await fireEvent.click(container.querySelector('img') as HTMLImageElement)
    expect(setFocusImg).toHaveBeenCalledWith(baseShot)
    expect(container.querySelector<HTMLDialogElement>('#focusImgModal')?.open).toBe(true)
  })

  it('calls setFocusImg and opens the modal via the View button', async () => {
    const { setFocusImg } = renderShot(baseShot)
    await fireEvent.click(screen.getByRole('button', { name: 'View screenshot' }))
    expect(setFocusImg).toHaveBeenCalledWith(baseShot)
  })

  it('renders an "Open in new tab" link pointing at the screenshot url', () => {
    renderShot(baseShot)
    const link = screen.getByRole('link', { name: 'Open screenshot in a new tab' })
    expect(link).toHaveAttribute('href', baseShot.url)
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('confirms the screenshot URL copy only after the clipboard write succeeds', async () => {
    let finishCopy = () => {}
    const pending = new Promise<void>((resolve) => {
      finishCopy = resolve
    })
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockReturnValue(pending)
    renderShot(baseShot)
    const button = screen.getByRole('button', { name: 'Copy screenshot URL' })
    await fireEvent.click(button)
    expect(writeText).toHaveBeenCalledWith(baseShot.url)
    expect(button).toBeDisabled()
    expect(button.querySelector('svg[data-icon="check"]')).toBeNull()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    finishCopy()
    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/copied/i))
    expect(button.querySelector('svg[data-icon="check"]')).not.toBeNull()
    expect(button).toBeEnabled()
  })

  it('shows a clipboard failure and allows the same screenshot URL to be copied again', async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValueOnce(new Error('Clipboard unavailable'))
      .mockResolvedValue(undefined)
    renderShot(baseShot)
    const button = screen.getByRole('button', { name: 'Copy screenshot URL' })
    await fireEvent.click(button)
    await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/unable to copy/i))
    expect(button.querySelector('svg[data-icon="check"]')).toBeNull()
    expect(button).toBeEnabled()
    await fireEvent.click(button)
    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/copied/i))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(writeText).toHaveBeenCalledTimes(2)
    expect(writeText).toHaveBeenLastCalledWith(baseShot.url)
  })
})
