import { describe, expect, it } from 'vitest'
import { createDocsPage } from '../../src/docs/page.js'
import { docsStyles } from '../../src/docs/styles.js'

describe('API documentation shell', () => {
  it('uses local assets and named accessible HTTP and WebSocket panels', () => {
    const page = createDocsPage()
    expect(page).toContain('<html lang="fr">')
    expect(page).toContain('role="tablist"')
    expect(page).toContain('aria-labelledby="tab-http"')
    expect(page).toContain('aria-labelledby="tab-ws"')
    expect(page).toContain('/v6/docs/assets/swagger-ui-bundle.js')
    expect(page).toContain('/v6/docs/assets/browser.js')
    expect(page).not.toMatch(/src="https?:/)
    expect(page).not.toContain('localStorage')
    expect(page).toContain('Le bouton « Execute » envoie une vraie requête')
    expect(docsStyles).toContain('@media(max-width:540px)')
  })
})
