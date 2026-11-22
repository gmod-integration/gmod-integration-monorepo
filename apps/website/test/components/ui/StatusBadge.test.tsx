import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { BooleanStatus, StatusBadge } from '../../../src/components/ui/index.js'
import { useI18n } from '../../../src/i18n.js'
import { renderWithProviders } from '../../testUtils.js'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('shared read-only states', () => {
  it('retains visible domain wording and native attributes without turning a static state into a live alert', () => {
    renderWithProviders(() => (
      <StatusBadge tone="warning" icon="triangle-alert" title="Server needs attention">
        Outdated
      </StatusBadge>
    ))
    const badge = screen.getByTitle('Server needs attention')
    expect(badge).toHaveTextContent('Outdated')
    expect(badge.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('updates enabled, disabled and unknown values independently of color or icon recognition', () => {
    const [value, setValue] = createSignal<boolean | undefined>(true)
    renderWithProviders(() => <BooleanStatus value={value()} />)
    expect(screen.getByText('Enabled')).toBeVisible()
    setValue(false)
    expect(screen.getByText('Disabled')).toBeVisible()
    expect(screen.queryByText('Enabled')).not.toBeInTheDocument()
    setValue(undefined)
    expect(screen.getByText('Unknown')).toBeVisible()
    expect(screen.queryByText('Disabled')).not.toBeInTheDocument()
  })

  it('keeps inactive values neutral and reserves error semantics for actual failures', () => {
    renderWithProviders(() => (
      <>
        <BooleanStatus value={false} />
        <StatusBadge tone="danger">Failed</StatusBadge>
      </>
    ))
    expect(screen.getByText('Disabled').parentElement).toHaveAttribute('data-tone', 'neutral')
    expect(screen.getByText('Failed').parentElement).toHaveAttribute('data-tone', 'danger')
  })

  it('uses localized labels and follows language changes without remounting', () => {
    const Example = () => {
      const { updateLocale } = useI18n()
      return (
        <>
          <BooleanStatus value={true} />
          <BooleanStatus value={false} />
          <BooleanStatus value={null} />
          <button onClick={() => updateLocale('fr')}>French</button>
        </>
      )
    }
    renderWithProviders(() => <Example />)
    fireEvent.click(screen.getByRole('button', { name: 'French' }))
    expect(screen.getByText('Activé')).toBeVisible()
    expect(screen.getByText('Désactivé')).toBeVisible()
    expect(screen.getByText('Inconnu')).toBeVisible()
  })

  it('accepts domain-specific positive, negative and unknown labels', () => {
    const [value, setValue] = createSignal<boolean | undefined>(true)
    renderWithProviders(() => (
      <BooleanStatus value={value()} trueLabel="Allowed" falseLabel="Not allowed" unknownLabel="Not checked" />
    ))
    expect(screen.getByText('Allowed')).toBeVisible()
    setValue(false)
    expect(screen.getByText('Not allowed')).toBeVisible()
    setValue(undefined)
    expect(screen.getByText('Not checked')).toBeVisible()
  })
})
