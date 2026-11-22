import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../testUtils.js'
import { AdminMenu } from '../../../../src/components/layout/menu/AdminMenu.js'
import { useI18n } from '../../../../src/i18n.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
beforeEach(() => window.localStorage.clear())

function renderAt(path = '/dashboard/admins/informations') {
  return renderWithProviders(() => <AdminMenu />, { path: '*', history: historyAt(path) })
}

describe('Admin navigation', () => {
  it('opens the mobile navigation and closes it after selecting a destination without changing collapse preference', async () => {
    localStorage.setItem('admin-navigation-collapsed', 'true')
    const history = historyAt('/dashboard/admins/informations')
    renderWithProviders(() => <AdminMenu />, { path: '*', history })
    const toggle = screen.getByRole('button', { name: 'Toggle navigation' })
    const sidebar = screen.getByRole('complementary')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(sidebar).toHaveAttribute('data-collapsed', 'true')
    await fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(sidebar).toHaveAttribute('data-mobile-open', 'true')
    expect(screen.getByText('Discord communities')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('link', { name: 'Discord communities' }))
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/admins/guilds'))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(sidebar).toHaveAttribute('data-mobile-open', 'false')
    expect(sidebar).toHaveAttribute('data-collapsed', 'true')
    expect(localStorage.getItem('admin-navigation-collapsed')).toBe('true')
  })

  it('exposes only implemented destinations and identifies the current page', () => {
    renderAt()
    const navigation = screen.getByRole('navigation', { name: 'Admin' })
    expect(within(navigation).getAllByRole('link')).toHaveLength(3)
    expect(within(navigation).getByRole('link', { name: 'Information' })).toHaveAttribute(
      'href',
      '/dashboard/admins/informations',
    )
    expect(within(navigation).getByRole('link', { name: 'Information' })).toHaveAttribute('aria-current', 'page')
    expect(within(navigation).getByRole('link', { name: 'Discord communities' })).toHaveAttribute(
      'href',
      '/dashboard/admins/guilds',
    )
    expect(within(navigation).getByRole('link', { name: 'Support access' })).toHaveAttribute(
      'href',
      '/dashboard/admins/impersonate',
    )
    for (const name of ['Users', 'Errors', 'Logs']) {
      expect(within(navigation).queryByRole('link', { name })).not.toBeInTheDocument()
    }
  })

  it('marks the matching destination after navigation', async () => {
    const history = historyAt('/dashboard/admins/informations')
    renderWithProviders(() => <AdminMenu />, { path: '*', history })
    fireEvent.click(screen.getByRole('link', { name: 'Discord communities' }))
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/admins/guilds'))
    expect(screen.getByRole('link', { name: 'Discord communities' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Information' })).not.toHaveAttribute('aria-current', 'page')
  })

  it('keeps navigation available on an unmatched route without marking a destination current', () => {
    renderAt('/dashboard/admins/unknown')
    for (const link of screen.getAllByRole('link')) expect(link).not.toHaveAttribute('aria-current', 'page')
  })

  it('collapses with a focusable button while retaining accessible destination names', () => {
    renderAt()
    const collapse = screen.getByRole('button', { name: 'Collapse' })
    collapse.focus()
    expect(collapse).toHaveFocus()
    expect(collapse).toHaveAttribute('type', 'button')
    expect(collapse).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(collapse, { detail: 0 })
    const expand = screen.getByRole('button', { name: 'Expand' })
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('link', { name: 'Information' })).toHaveAttribute('title', 'Information')
    expect(screen.queryByText('Information')).not.toBeInTheDocument()
    expect(window.localStorage.getItem('admin-navigation-collapsed')).toBe('true')

    fireEvent.mouseEnter(screen.getByRole('complementary'))
    expect(expand).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Information')).toBeInTheDocument()
    fireEvent.mouseLeave(screen.getByRole('complementary'))
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Information')).not.toBeInTheDocument()
    fireEvent.click(expand)
    expect(screen.getByRole('button', { name: 'Collapse' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Information')).toBeInTheDocument()
  })

  it('restores the collapsed preference when mounted again', () => {
    const first = renderAt()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }))
    first.unmount()
    renderAt()
    expect(screen.getByRole('button', { name: 'Expand' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('link', { name: 'Discord communities' })).toBeInTheDocument()
  })

  it('remains usable when persistence is unavailable', () => {
    renderAt()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Collapse' }))).not.toThrow()
    expect(screen.getByRole('button', { name: 'Expand' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('starts expanded when reading the stored preference is unavailable', () => {
    const getItem = Storage.prototype.getItem
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) {
      if (key === 'admin-navigation-collapsed') throw new Error('storage unavailable')
      return getItem.call(this, key)
    })
    expect(() => renderAt()).not.toThrow()
    expect(screen.getByRole('button', { name: 'Collapse' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('updates labels when the current language changes', () => {
    const Page = () => {
      const { updateLocale } = useI18n()
      return (
        <>
          <button onClick={() => updateLocale('fr')}>Français</button>
          <AdminMenu />
        </>
      )
    }
    renderWithProviders(Page)
    fireEvent.click(screen.getByRole('button', { name: 'Français' }))
    expect(screen.getByRole('link', { name: 'Communautés Discord' })).toHaveAttribute(
      'href',
      '/dashboard/admins/guilds',
    )
    expect(screen.queryByRole('link', { name: 'Discord communities' })).not.toBeInTheDocument()
  })
})
