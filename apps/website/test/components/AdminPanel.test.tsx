import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, screen, within } from '@solidjs/testing-library'
import { createSignal, Show } from 'solid-js'
import { renderWithProviders } from '../testUtils.js'
import AdminPanel from '../../src/components/AdminPanel.js'
import { linkBadge } from '../../src/components/layout/menu/DashboardMenu.js'
import { AutosaveFeedback } from '../../src/components/ui/AutosaveFeedback.js'

afterEach(() => cleanup())

function setGuildPremium(isPremium: boolean) {
  window.localStorage.setItem('guilds', JSON.stringify({ isPremium }))
}

describe('components/AdminPanel.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders title, description, and children', () => {
    renderWithProviders(() => (
      <AdminPanel title="My Panel" description="Panel description">
        <div data-testid="child">panel body</div>
      </AdminPanel>
    ))
    expect(screen.getByText('My Panel')).toBeInTheDocument()
    expect(screen.getByText('Panel description')).toBeInTheDocument()
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('does not render a badge when badge prop is absent', () => {
    renderWithProviders(() => <AdminPanel title="t" description="d" />)
    expect(screen.queryByText(/badge_/)).not.toBeInTheDocument()
  })

  it('renders a translated badge when badge prop is provided', () => {
    renderWithProviders(() => <AdminPanel title="t" description="d" badge={linkBadge.NEW} />)
    expect(screen.getByText('New').closest('[data-tone]')).toHaveAttribute('data-tone', 'info')
  })

  it('does not render the info row when info is absent', () => {
    const { container } = renderWithProviders(() => <AdminPanel title="t" description="d" />)
    expect(container.querySelector('[data-icon="info"]')).not.toBeInTheDocument()
  })

  it('renders the info row when info is provided', () => {
    renderWithProviders(() => <AdminPanel title="t" description="d" info="Some extra info" />)
    expect(screen.getByText('Some extra info')).toBeInTheDocument()
  })

  it('does not show the premium banner when premium is not set', () => {
    setGuildPremium(false)
    renderWithProviders(() => <AdminPanel title="t" description="d" />)
    expect(screen.queryByRole('link', { name: 'View Premium plans' })).not.toBeInTheDocument()
  })

  it('does not show the premium banner when the guild already has premium', () => {
    setGuildPremium(true)
    renderWithProviders(() => <AdminPanel title="t" description="d" premium />)
    expect(screen.queryByRole('link', { name: 'View Premium plans' })).not.toBeInTheDocument()
  })

  it('shows the default premium message and upgrade link when premium is true and guild lacks premium', () => {
    setGuildPremium(false)
    renderWithProviders(() => <AdminPanel title="t" description="d" premium />)
    expect(screen.getByText(/This feature requires Premium for this Discord community\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View Premium plans' })).toHaveAttribute('href', '/premium')
  })

  it('shows a custom premium message string when premium is a string and guild lacks premium', () => {
    setGuildPremium(false)
    renderWithProviders(() => <AdminPanel title="t" description="d" premium="Custom premium copy" />)
    expect(screen.getByText(/Custom premium copy/)).toBeInTheDocument()
  })

  it('applies gap/padding classes when type is not "none"', () => {
    const { container } = renderWithProviders(() => (
      <AdminPanel title="t" description="d">
        <span>Settings</span>
      </AdminPanel>
    ))
    const childrenWrapper = container.querySelector('hr + div')
    expect(childrenWrapper).toHaveClass('gap-4', 'p-4')
  })

  it('omits gap/padding classes when type is "none"', () => {
    const { container } = renderWithProviders(() => (
      <AdminPanel title="t" description="d" type="none">
        <span>Settings</span>
      </AdminPanel>
    ))
    const childrenWrapper = container.querySelector('hr + div')
    expect(childrenWrapper).not.toHaveClass('gap-4')
    expect(childrenWrapper).not.toHaveClass('p-4')
  })

  it('omits the padded body and header divider when its children render nothing', () => {
    const [visible, setVisible] = createSignal(false)
    const { container } = renderWithProviders(() => (
      <AdminPanel title="Conditional content" footer={<span>Footer content</span>}>
        <Show when={visible()}>
          <span>Body content</span>
        </Show>
        {false}
        {undefined}
      </AdminPanel>
    ))
    expect(container.querySelector('.dashboard-panel-body')).not.toBeInTheDocument()
    expect(container.querySelector('.dashboard-panel-divider')).not.toBeInTheDocument()
    expect(screen.getByText('Footer content').closest('.dashboard-panel-footer')).toBeInTheDocument()

    setVisible(true)
    expect(screen.getByText('Body content').closest('.dashboard-panel-body')).toHaveClass('p-4')
    expect(container.querySelectorAll('.dashboard-panel-divider')).toHaveLength(1)

    setVisible(false)
    expect(container.querySelector('.dashboard-panel-body')).not.toBeInTheDocument()
    expect(container.querySelector('.dashboard-panel-divider')).not.toBeInTheDocument()
    expect(screen.getByText('Footer content')).toBeInTheDocument()
  })

  it('renders a footer only while autosave feedback has content and preserves the body', () => {
    const initial = { queued: false, pending: false, error: undefined as string | undefined, success: false }
    const [state, setState] = createSignal(initial)
    const { container } = renderWithProviders(() => (
      <AdminPanel
        title="Autosaving settings"
        footer={
          <AutosaveFeedback
            state={{
              queued: () => state().queued,
              pending: () => state().pending,
              error: () => state().error,
              success: () => state().success,
              retry: async () => {},
            }}
          />
        }
      >
        <input aria-label="Nickname format" value="{plyName}" />
      </AdminPanel>
    ))
    const field = screen.getByRole('textbox', { name: 'Nickname format' })
    expect(container.querySelector('.dashboard-panel-footer')).not.toBeInTheDocument()

    setState({ ...initial, queued: true })
    expect(screen.getByRole('status')).toHaveTextContent('Saving')
    expect(screen.getByRole('status').closest('.dashboard-panel-footer')).toBeInTheDocument()

    setState({ ...initial, pending: true })
    expect(container.querySelector('.settings-autosave')).toHaveAttribute('aria-busy', 'true')

    setState({ ...initial, error: 'Save failed' })
    expect(screen.getByRole('alert')).toHaveTextContent('Save failed')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()

    setState({ ...initial, success: true })
    expect(screen.getByRole('status')).toHaveTextContent('Saved')

    setState(initial)
    expect(container.querySelector('.dashboard-panel-footer')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Nickname format' })).toBe(field)
    expect(container.querySelectorAll('.dashboard-panel-divider')).toHaveLength(1)
  })

  it('supports shared header actions and footer without requiring a description', () => {
    renderWithProviders(() => (
      <AdminPanel
        id="community-links"
        title="Links"
        actions={<button>Add a link</button>}
        footer={<span>2 links</span>}
      >
        <span>Configuration</span>
      </AdminPanel>
    ))
    const card = screen.getByRole('region', { name: 'Links' })
    expect(card).toHaveAttribute('id', 'community-links')
    expect(within(card).getByRole('heading', { name: 'Links' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Add a link' })).toBeInTheDocument()
    expect(within(card).getByText('2 links')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a link' })).toBeInTheDocument()
    expect(screen.getByText('2 links')).toBeInTheDocument()
    expect(screen.getByText('Configuration')).toBeInTheDocument()
  })
})
