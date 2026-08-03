import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen } from '@solidjs/testing-library'
import { I18nProvider, useI18n } from '../src/i18n.js'

afterEach(() => cleanup())

function Probe() {
  const { t, locale, updateLocale } = useI18n()
  return (
    <div>
      <span data-testid="locale">{locale()}</span>
      <span data-testid="translated">{t('main.premium', 'default premium')}</span>
      <span data-testid="missing">{t('this.key.does.not.exist', 'fallback text')}</span>
      <span data-testid="missing-no-default">{t('this.key.also.does.not.exist', undefined)}</span>
      <span data-testid="interpolated">{t('premium.guild_roles', 'default {1}', '5')}</span>
      <span data-testid="fr-fallback">{t('dashboard.guild.verification.check', 'fallback check')}</span>
      <button onClick={() => updateLocale('fr')}>fr</button>
      <button onClick={() => updateLocale('not-a-real-locale')}>bad</button>
    </div>
  )
}

describe('i18n.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('throws when useI18n is called outside an I18nProvider', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(() => <Probe />)).toThrow('useI18n must be used within an I18nProvider')
    errorSpy.mockRestore()
  })

  it('defaults to English when no locale is stored, translates keys and interpolates args', () => {
    render(() => (
      <I18nProvider>
        <Probe />
      </I18nProvider>
    ))
    expect(screen.getByTestId('locale')).toHaveTextContent('en')
    expect(screen.getByTestId('translated')).toHaveTextContent('Premium')
    expect(screen.getByTestId('interpolated')).toHaveTextContent('5 roles')
  })

  it('falls back to the English translation when the current locale is missing a key', () => {
    window.localStorage.setItem('locale', 'fr')
    render(() => (
      <I18nProvider>
        <Probe />
      </I18nProvider>
    ))
    expect(screen.getByTestId('fr-fallback')).not.toHaveTextContent('fallback check')
    expect(screen.getByTestId('fr-fallback')).not.toBeEmptyDOMElement()
  })

  it('restores a previously stored locale', () => {
    window.localStorage.setItem('locale', 'fr')
    render(() => (
      <I18nProvider>
        <Probe />
      </I18nProvider>
    ))
    expect(screen.getByTestId('locale')).toHaveTextContent('fr')
  })

  it('falls back to the provided default text when a key is missing, warning once', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(() => (
      <I18nProvider>
        <Probe />
      </I18nProvider>
    ))
    expect(screen.getByTestId('missing')).toHaveTextContent('fallback text')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('this.key.does.not.exist'))
    // With no defaultText either, `t()` falls all the way back to returning the key itself.
    expect(screen.getByTestId('missing-no-default')).toHaveTextContent('this.key.also.does.not.exist')
    warnSpy.mockRestore()
  })

  it('updateLocale switches locale and persists it, ignoring unknown locales', async () => {
    render(() => (
      <I18nProvider>
        <Probe />
      </I18nProvider>
    ))
    screen.getByText('fr').click()
    expect(screen.getByTestId('locale')).toHaveTextContent('fr')
    expect(window.localStorage.getItem('locale')).toBe('fr')

    screen.getByText('bad').click()
    // Unknown locale is ignored: still 'fr', not persisted over.
    expect(screen.getByTestId('locale')).toHaveTextContent('fr')
  })
})
