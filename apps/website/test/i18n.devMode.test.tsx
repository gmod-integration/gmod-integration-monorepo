import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@solidjs/testing-library'

vi.mock('../src/utils/utils.js', () => ({
  isDevEnvironment: () => true,
  DEV_SHOW_MISSING_TRANSLATIONS: true,
}))

const { I18nProvider, useI18n } = await import('../src/i18n.js')

afterEach(() => cleanup())

function Probe() {
  const { t } = useI18n()
  return <span data-testid="missing">{t('this.key.does.not.exist', 'fallback text')}</span>
}

describe('i18n.tsx in dev mode with DEV_SHOW_MISSING_TRANSLATIONS enabled', () => {
  it('wraps the fallback default text with a visible missing-translation marker', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(() => (
      <I18nProvider>
        <Probe />
      </I18nProvider>
    ))
    expect(screen.getByTestId('missing')).toHaveTextContent('💥💥 - fallback text - this.key.does.not.exist - 💥💥')
    warnSpy.mockRestore()
  })
})
