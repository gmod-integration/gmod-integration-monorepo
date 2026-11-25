import { describe, expect, it } from 'vitest'
import {
  StatusConfigurationSaveSchema,
  StatusConfigurationSnapshotSchema,
} from '../../src/server/StatusConfigurationSchema.js'
const configuration = {
  settings: { show_player_list_status: false, status_player_list_format: '{name}', show_status_chart: false },
  buttons: [{ id: 1, name: 'Rules', emoji: '', url: 'https://example.test', enable: true }],
}
const snapshot = () => ({ configuration: structuredClone(configuration), revision: 'a'.repeat(64) })
describe('status configuration contract', () => {
  it('requires a revision and complete, owned-field-only configuration', () => {
    expect(StatusConfigurationSaveSchema.safeParse(snapshot()).success).toBe(true)
    for (const value of [
      { configuration },
      { ...snapshot(), revision: '' },
      { ...snapshot(), guildID: 'g1' },
      {
        ...snapshot(),
        configuration: {
          ...configuration,
          settings: { ...configuration.settings, status_player_list_format: 'x'.repeat(256) },
        },
      },
      { ...snapshot(), configuration: { ...configuration, settings: { ...configuration.settings, token: 'secret' } } },
    ])
      expect(StatusConfigurationSaveSchema.safeParse(value).success).toBe(false)
  })
  it('allows legacy incomplete buttons to load for repair but prevents saving them', () => {
    const legacy = snapshot()
    legacy.configuration.buttons[0]!.name = ''
    legacy.configuration.buttons[0]!.url = ''
    expect(StatusConfigurationSnapshotSchema.safeParse(legacy).success).toBe(true)
    expect(StatusConfigurationSaveSchema.safeParse(legacy).success).toBe(false)
  })
  it('rejects duplicate/foreign-shaped IDs, unsupported URL schemes and excessive payloads', () => {
    const cases = [
      {
        ...snapshot(),
        configuration: { ...configuration, buttons: [configuration.buttons[0], configuration.buttons[0]] },
      },
      {
        ...snapshot(),
        configuration: { ...configuration, buttons: [{ ...configuration.buttons[0], url: 'javascript:alert(1)' }] },
      },
      { ...snapshot(), configuration: { ...configuration, buttons: [{ ...configuration.buttons[0], id: 0 }] } },
      {
        ...snapshot(),
        configuration: {
          ...configuration,
          buttons: Array.from({ length: 26 }, () => ({
            name: 'Rules',
            emoji: '',
            url: 'https://example.test',
            enable: true,
          })),
        },
      },
    ]
    for (const value of cases) expect(StatusConfigurationSaveSchema.safeParse(value).success).toBe(false)
  })
})
