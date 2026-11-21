import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { SettingFeedback } from '../../../src/components/ui/Settings.js'
import { renderWithProviders } from '../../testUtils.js'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('setting feedback', () => {
  it('announces pending, rejected and successful saves in order without showing stale feedback', () => {
    const [state, setState] = createSignal({ pending: false, error: '', success: false })
    renderWithProviders(() => (
      <SettingFeedback pending={state().pending} error={state().error} success={state().success} />
    ))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    setState({ pending: true, error: 'Previous failure', success: true })
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()

    setState({ pending: false, error: 'The server could not save this setting.', success: true })
    expect(screen.getByRole('alert')).toHaveTextContent('The server could not save this setting.')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    setState({ pending: false, error: '', success: true })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Saved')

    setState({ pending: false, error: '', success: false })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
