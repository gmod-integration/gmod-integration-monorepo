import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@solidjs/testing-library'
import { ColorsLogsType } from '../../../../../../src/pages/dashboard/guilds/servers/logs/ColorLogsType.js'
import { I18nProvider } from '../../../../../../src/i18n.js'

afterEach(() => cleanup())

function renderColor(category: string, className?: string) {
  return render(() => (
    <I18nProvider>
      <table>
        <tbody>
          <tr>
            <ColorsLogsType category={category} className={className} />
          </tr>
        </tbody>
      </table>
    </I18nProvider>
  ))
}

describe('pages/dashboard/guilds/servers/logs/ColorLogsType.tsx', () => {
  it('renders the known color and translated name for a known category', () => {
    const { container } = renderColor('player_connect')
    const td = container.querySelector('td')!
    expect(td).toHaveStyle('color: #cd8f51')
    expect(td).toHaveTextContent('Player Connect')
    expect(td).toHaveClass('text-base-content/70')
  })

  it('falls back to white and the raw category name for an unrecognized category', () => {
    const { container } = renderColor('some_unknown_category')
    const td = container.querySelector('td')!
    expect(td).toHaveStyle('color: #fff')
    expect(td).toHaveTextContent('some_unknown_category')
  })

  it('appends a custom className when provided', () => {
    const { container } = renderColor('player_connect', 'extra-class')
    const td = container.querySelector('td')!
    expect(td).toHaveClass('text-base-content/70')
    expect(td).toHaveClass('extra-class')
  })

  it('uses just the base class when className is omitted', () => {
    const { container } = renderColor('player_connect')
    const td = container.querySelector('td')!
    expect(td.getAttribute('class')).toBe('text-base-content/70 ')
  })
})
