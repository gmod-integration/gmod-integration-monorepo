import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../testUtils.js'

vi.mock('../../src/utils/api.js', async (importActual) => {
  const actual = await importActual<typeof import('../../src/utils/api.js')>()
  return {
    ...actual,
    fetchAPI: vi.fn(() => Promise.resolve({ ok: true, json: async () => [] })),
  }
})

const { guildChannels, guildChannelsMutate, guildChannelsRefetch } = await import(
  '../../src/pages/dashboard/guilds/GuildInformations.js'
)
const { ChannelSelector, default: AdminChannelSelector } = await import('../../src/components/AdminChannelSelector.js')
const { fetchAPI } = await import('../../src/utils/api.js')

afterEach(() => cleanup())

const CATEGORY = { id: 'cat1', name: 'Category One', type: 4, position: 0, parentID: null }
const CATEGORY_EMPTY = { id: 'cat2', name: 'Empty Category', type: 4, position: 1, parentID: null }
const CHANNEL_IN_CATEGORY = { id: 'chan1', name: 'in-category', type: 0, position: 0, parentID: 'cat1' }
const CHANNEL_NO_CATEGORY = { id: 'chan2', name: 'no-category', type: 0, position: 0, parentID: null }
const VOICE_CHANNEL_NO_CATEGORY = {
  id: 'chan3',
  name: 'voice-channel',
  type: 2,
  position: 1,
  parentID: null,
  textBased: false,
}
const CHANNEL_NULL_POSITION = { id: 'chan4', name: 'null-position', type: 0, position: null, parentID: null }
const CHANNEL_NAN_TYPE = { id: 'chan5', name: 'weird-type', type: 'not-a-number', position: 2, parentID: null }

describe('components/AdminChannelSelector.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    guildChannelsMutate([
      CATEGORY,
      CATEGORY_EMPTY,
      CHANNEL_IN_CATEGORY,
      CHANNEL_NO_CATEGORY,
      VOICE_CHANNEL_NO_CATEGORY,
      CHANNEL_NULL_POSITION,
      CHANNEL_NAN_TYPE,
    ])
  })

  describe('ChannelSelector', () => {
    it('groups channels with a parent under their category optgroup, and drops empty categories', () => {
      const { container } = renderWithProviders(() => <ChannelSelector />)
      const optgroups = container.querySelectorAll('optgroup')
      const labels = Array.from(optgroups).map((g) => g.getAttribute('label'))
      expect(labels).toContain('Category One')
      expect(labels).not.toContain('Empty Category')
    })

    it('lists channels without a parent under the "No Category" group', () => {
      const { container } = renderWithProviders(() => <ChannelSelector />)
      const noCategoryGroup = Array.from(container.querySelectorAll('optgroup')).find(
        (g) => g.getAttribute('label') === 'No Category',
      )
      expect(noCategoryGroup).toBeTruthy()
      expect(noCategoryGroup?.textContent).toContain('no-category')
    })

    it('excludes category-type channels themselves from the selectable option lists', () => {
      const { container } = renderWithProviders(() => <ChannelSelector />)
      const optionTexts = Array.from(container.querySelectorAll('option')).map((o) => o.textContent)
      expect(optionTexts).not.toContain('Category One')
      expect(optionTexts).not.toContain('Empty Category')
    })

    it('excludes non-text channels by default (onlyTextChannel defaults to true)', () => {
      const { container } = renderWithProviders(() => <ChannelSelector />)
      const optionTexts = Array.from(container.querySelectorAll('option')).map((o) => o.textContent)
      expect(optionTexts).not.toContain('voice-channel')
    })

    it('includes non-text channels when onlyTextChannel is false', () => {
      const { container } = renderWithProviders(() => <ChannelSelector onlyTextChannel={false} />)
      const optionTexts = Array.from(container.querySelectorAll('option')).map((o) => o.textContent)
      expect(optionTexts).toContain('voice-channel')
    })

    it('treats a null position as sorting last and a non-numeric type as non-category', () => {
      const { container } = renderWithProviders(() => <ChannelSelector />)
      const optionTexts = Array.from(container.querySelectorAll('option')).map((o) => o.textContent)
      expect(optionTexts).toContain('null-position')
      expect(optionTexts).toContain('weird-type')
    })

    it('marks the option matching idSelect as selected', () => {
      const { container } = renderWithProviders(() => <ChannelSelector idSelect="chan2" />)
      const option = container.querySelector('option[value="chan2"]') as HTMLOptionElement
      expect(option.selected).toBe(true)
    })

    it('always renders the default placeholder option', () => {
      renderWithProviders(() => <ChannelSelector />)
      expect(screen.getByText('Select a Channel')).toBeInTheDocument()
    })

    it('invokes the callback with the selected channel id on change', () => {
      const callback = vi.fn()
      const { container } = renderWithProviders(() => <ChannelSelector callback={callback} />)
      const select = container.querySelector('select') as HTMLSelectElement
      fireEvent.change(select, { target: { value: 'chan2' } })
      expect(callback).toHaveBeenCalledWith('chan2')
    })

    it('does not throw when no callback is provided', () => {
      const { container } = renderWithProviders(() => <ChannelSelector />)
      const select = container.querySelector('select') as HTMLSelectElement
      expect(() => fireEvent.change(select, { target: { value: 'chan2' } })).not.toThrow()
    })

    it('closes the dialog matching modalId when hasModal is set and a matching dialog exists', () => {
      const callback = vi.fn()
      const { container } = renderWithProviders(() => (
        <>
          <dialog id="my_modal"></dialog>
          <ChannelSelector callback={callback} hasModal modalId="my_modal" />
        </>
      ))
      const closeSpy = vi.fn()
      const dialog = container.querySelector('#my_modal') as HTMLDialogElement
      dialog.close = closeSpy
      const select = container.querySelector('select') as HTMLSelectElement
      fireEvent.change(select, { target: { value: 'chan2' } })
      expect(closeSpy).toHaveBeenCalled()
      expect(callback).toHaveBeenCalledWith('chan2')
    })

    it('does not attempt to close a dialog when hasModal is set but no modalId is provided', () => {
      const callback = vi.fn()
      const { container } = renderWithProviders(() => <ChannelSelector callback={callback} hasModal />)
      const select = container.querySelector('select') as HTMLSelectElement
      expect(() => fireEvent.change(select, { target: { value: 'chan2' } })).not.toThrow()
      expect(callback).toHaveBeenCalledWith('chan2')
    })

    it('shows a loading placeholder while guildChannels is refetching', async () => {
      let resolveFetch: (value: any) => void = () => {}
      ;(fetchAPI as any).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve
          }),
      )
      const refetchPromise = guildChannelsRefetch()
      const { container } = renderWithProviders(() => <ChannelSelector />)
      expect(container).toHaveTextContent('Loading...')

      resolveFetch({ ok: true, json: async () => [CHANNEL_NO_CATEGORY] })
      await refetchPromise
      await vi.waitFor(() => expect(guildChannels.loading).toBe(false))
    })
  })

  describe('AdminChannelSelector', () => {
    it('wraps ChannelSelector in an AdminModal with the given id and title', () => {
      const { container } = renderWithProviders(() => <AdminChannelSelector id="pick_channel" title="Pick one" />)
      expect(container.querySelector('dialog#pick_channel')).toBeInTheDocument()
      expect(screen.getByText('Pick one')).toBeInTheDocument()
    })

    it('falls back to the translated default title when title is not provided', () => {
      const { container } = renderWithProviders(() => <AdminChannelSelector id="pick_channel" />)
      expect(container.querySelector('h2')).toHaveTextContent('Select a Channel')
    })

    it('closes its own dialog (matching its id) via the modalId plumbed through to ChannelSelector', () => {
      const { container } = renderWithProviders(() => <AdminChannelSelector id="pick_channel_2" />)
      const dialog = container.querySelector('dialog#pick_channel_2') as HTMLDialogElement
      const closeSpy = vi.fn()
      dialog.close = closeSpy
      const select = container.querySelector('select') as HTMLSelectElement
      fireEvent.change(select, { target: { value: 'chan2' } })
      expect(closeSpy).toHaveBeenCalled()
    })
  })
})
