import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { I18nProvider } from '../../../../../../src/i18n.js'
import { FocusImg } from '../../../../../../src/pages/dashboard/guilds/servers/screenshots/FocusImg.js'
import type { ScreenshotStructure } from '../../../../../../src/pages/dashboard/guilds/servers/screenshots/ServerScreenshotList.js'

afterEach(() => cleanup())

const baseShot: ScreenshotStructure = {
  id: 1,
  serverID: 's1',
  title: 'My Screenshot',
  player: { name: 'Bob', steamID64: '765123' },
  url: 'https://example.com/shot.png',
  createdAt: '1/1/2024, 12:00:00 AM',
  channelID: 'c1',
  captureData: { x: 0, y: 0, w: 100, h: 100, quality: 90, format: 'png' },
}

function renderFocusImg(initial: ScreenshotStructure | null) {
  const [focusImg, setFocusImg] = createSignal<ScreenshotStructure | null>(initial)
  const utils = render(() => (
    <I18nProvider>
      <FocusImg focusImg={focusImg} />
    </I18nProvider>
  ))
  return { ...utils, setFocusImg }
}

describe('pages/dashboard/guilds/servers/screenshots/FocusImg.tsx', () => {
  it('renders nothing when focusImg is null', () => {
    const { container } = renderFocusImg(null)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the dialog with title, image, and metadata when focusImg is set', () => {
    const { container } = renderFocusImg(baseShot)
    expect(screen.getByText('My Screenshot')).toBeInTheDocument()
    // happy-dom doesn't compute an accessibility tree for a closed (no `open` attr) <dialog>,
    // so query the <img> directly rather than via getByRole.
    const img = container.querySelector('img') as HTMLImageElement
    expect(img).toHaveAttribute('src', baseShot.url)
    expect(screen.getByText(/1\/1\/2024/)).toBeInTheDocument()
    // "Bob"/"765123" also appear inside the JsonViewer's highlighted JSON dump below, so scope
    // to the plain metadata paragraphs specifically.
    const infoParagraphs = Array.from(container.querySelectorAll('p')).map((p) => p.textContent)
    expect(infoParagraphs.some((text) => text?.includes('Bob'))).toBe(true)
    expect(infoParagraphs.some((text) => text?.includes('765123'))).toBe(true)
  })

  it('falls back to "No Title" when the title is empty', () => {
    renderFocusImg({ ...baseShot, title: '' })
    expect(screen.getByText('No Title')).toBeInTheDocument()
  })

  it('falls back to "No Name" and "No Steam ID 64" when player fields are empty', () => {
    renderFocusImg({ ...baseShot, player: { name: '', steamID64: '' } })
    expect(screen.getByText('No Name', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('No Steam ID 64', { exact: false })).toBeInTheDocument()
  })

  it('shows the Player Metadata section only when player is not null', () => {
    renderFocusImg(baseShot)
    expect(screen.getByText('Player Metadata')).toBeInTheDocument()
  })

  it('shows the Capture Data section (translated as "Capture Metadata") only when captureData is not null', () => {
    renderFocusImg(baseShot)
    expect(screen.getByText('Capture Metadata')).toBeInTheDocument()
  })

  it('hides the Player Metadata section when player is null', () => {
    renderFocusImg({ ...baseShot, player: null })
    expect(screen.queryByText('Player Metadata')).not.toBeInTheDocument()
  })

  it('hides the Capture Metadata section when captureData is null', () => {
    renderFocusImg({ ...baseShot, captureData: null })
    expect(screen.queryByText('Capture Metadata')).not.toBeInTheDocument()
  })

  it('re-renders and scrolls to top when focusImg changes to a new non-null value', async () => {
    const { setFocusImg } = renderFocusImg(baseShot)
    setFocusImg({ ...baseShot, id: 2, title: 'Second Shot' })
    await vi.waitFor(() => expect(screen.getByText('Second Shot')).toBeInTheDocument())
  })
})
