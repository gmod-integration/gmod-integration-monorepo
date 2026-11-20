import { describe, expect, it, vi } from 'vitest'

vi.mock('@gmod/infra-redis', () => ({ default: { get: vi.fn().mockResolvedValue(null), set: vi.fn() } }))
vi.mock('@gmod/shared/logger.js', () => ({ gmLog: vi.fn() }))
const { getTranslate } = await import('../../src/utils/localizations.js')

describe('installed bot translations', () => {
  it('loads the real locale files when the bot starts outside the workspace root', async () => {
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue('/tmp/discord-runtime')
    try {
      await expect(getTranslate('status_of', 'fr-FR', ['Serveur démo'])).resolves.toBe('Statut de Serveur démo')
      await expect(getTranslate('player_list', 'fr')).resolves.toBe('Joueurs Connectés')
      await expect(getTranslate('server-connect', 'en-US')).resolves.toBe('Connect')
      await expect(getTranslate('name', 'zz')).resolves.toBe('Name')
    } finally {
      cwd.mockRestore()
    }
  })
})
