import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { DateTime } from '../../../src/components/ui/index.js'
import { useI18n } from '../../../src/i18n.js'
import { formatDateTime } from '../../../src/utils/dateTime.js'
import { renderWithProviders } from '../../testUtils.js'

const instant = '2026-11-25T00:05:06.000Z'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('shared date and time', () => {
  it.each([
    ['en', '11/25/2026'],
    ['fr', '25/11/2026'],
  ])('uses the %s date order and a 24-hour time while keeping the full instant available', (locale, date) => {
    localStorage.setItem('locale', locale)
    renderWithProviders(() => <DateTime value={instant} timeZone="UTC" data-testid="timestamp" />)
    const timestamp = screen.getByTestId('timestamp')

    expect(timestamp.tagName).toBe('TIME')
    expect(timestamp).toHaveAttribute('datetime', instant)
    expect(timestamp).toHaveTextContent(date)
    expect(timestamp).toHaveTextContent('00:05')
    expect(timestamp.textContent).not.toMatch(/\b(?:AM|PM)\b/)
    expect(timestamp).not.toHaveTextContent('00:05:06')
    expect(timestamp.getAttribute('title')).toContain('00:05:06')
    expect(timestamp.getAttribute('title')).toMatch(/UTC|GMT|Universal/)
  })

  it('uses the requested timezone across a date boundary without changing the machine-readable instant', () => {
    renderWithProviders(() => (
      <DateTime value="2026-01-01T00:30:09.000Z" timeZone="America/Los_Angeles" data-testid="timestamp" />
    ))
    const timestamp = screen.getByTestId('timestamp')

    expect(timestamp).toHaveTextContent('12/31/2025')
    expect(timestamp).toHaveTextContent('16:30')
    expect(timestamp).toHaveAttribute('datetime', '2026-01-01T00:30:09.000Z')
    expect(timestamp.getAttribute('title')).toContain('16:30:09')
  })

  it.each([undefined, null, '', 'not-a-date', new Date(Number.NaN), Number.NaN, Infinity])(
    'renders an unavailable value (%s) without an invented date or machine-readable time',
    (value) => {
      const { container } = renderWithProviders(() => <DateTime value={value} />)

      expect(container).toHaveTextContent('—')
      expect(container.querySelector('time')).not.toBeInTheDocument()
      expect(container.querySelector('[datetime], [title]')).not.toBeInTheDocument()
      expect(container).not.toHaveTextContent(/Invalid Date|1970/)
    },
  )

  it('updates the displayed date and locale without remounting its caller', async () => {
    const [value, setValue] = createSignal(instant)
    const Example = () => {
      const { updateLocale } = useI18n()
      return (
        <>
          <DateTime value={value()} timeZone="UTC" data-testid="timestamp" />
          <button onClick={() => updateLocale('fr')}>French</button>
        </>
      )
    }
    renderWithProviders(() => <Example />)
    expect(screen.getByTestId('timestamp')).toHaveTextContent('11/25/2026')

    setValue('2027-01-02T23:15:42.000Z')
    expect(screen.getByTestId('timestamp')).toHaveTextContent('01/02/2027')
    expect(screen.getByTestId('timestamp')).toHaveTextContent('23:15')
    await fireEvent.click(screen.getByRole('button', { name: 'French' }))

    expect(screen.getByTestId('timestamp')).toHaveTextContent('02/01/2027')
    expect(screen.getByTestId('timestamp')).toHaveAttribute('datetime', '2027-01-02T23:15:42.000Z')
    expect(screen.getByTestId('timestamp').getAttribute('title')).toContain('23:15:42')
  })

  it('supports a date-only display and native time attributes', () => {
    renderWithProviders(() => (
      <DateTime
        value={instant}
        dateOnly
        timeZone="UTC"
        id="registered-at"
        class="registration-date"
        aria-label="Registration date"
      />
    ))
    const timestamp = screen.getByLabelText('Registration date')

    expect(timestamp).toHaveAttribute('id', 'registered-at')
    expect(timestamp).toHaveClass('registration-date')
    expect(timestamp).toHaveAttribute('datetime', instant)
    expect(timestamp).toHaveTextContent('11/25/2026')
    expect(timestamp.textContent).not.toContain('00:05')
  })

  it('keeps a custom fallback and removes stale date metadata when a value becomes unavailable', () => {
    const [value, setValue] = createSignal<string | null>(instant)
    const { container } = renderWithProviders(() => (
      <DateTime value={value()} timeZone="UTC" fallback={<span>Not reported</span>} />
    ))
    expect(container.querySelector('time')).toHaveAttribute('datetime', instant)

    setValue(null)

    expect(screen.getByText('Not reported')).toBeVisible()
    expect(container.querySelector('time, [datetime], [title]')).not.toBeInTheDocument()
  })
})

describe('plain date formatting', () => {
  it('shares localized compact formatting with the visual component', () => {
    expect(formatDateTime(instant, 'en', { timeZone: 'UTC' })).toBe('11/25/2026 · 00:05')
    expect(formatDateTime(instant, 'fr', { timeZone: 'UTC' })).toBe('25/11/2026 · 00:05')
    expect(formatDateTime(instant, 'fr', { dateOnly: true, timeZone: 'UTC' })).toBe('25/11/2026')
  })

  it('accepts Date objects and numeric milliseconds, including an explicit Unix epoch', () => {
    expect(formatDateTime(new Date(instant), 'en', { timeZone: 'UTC' })).toBe('11/25/2026 · 00:05')
    expect(formatDateTime(Date.parse(instant), 'en', { timeZone: 'UTC' })).toBe('11/25/2026 · 00:05')
    expect(formatDateTime(0, 'en', { timeZone: 'UTC' })).toBe('01/01/1970 · 00:00')
  })

  it('keeps absent and invalid values distinct from an explicitly provided epoch', () => {
    for (const value of [undefined, null, '', 'not-a-date', new Date(Number.NaN), Number.NaN, Infinity]) {
      expect(formatDateTime(value, 'en', { timeZone: 'UTC' })).toBe('—')
    }
  })
})
