import { vi, type Mock } from 'vitest'
import { historyAt, renderWithProviders } from '../../../../../testUtils.js'
import ServerStatus from '../../../../../../src/pages/dashboard/guilds/servers/status/ServerStatus.js'
import { DraftEditingProvider } from '../../../../../../src/components/DraftEditingProvider.js'
import { A } from '@solidjs/router'
import { guildChannelsMutate } from '../../../../../../src/pages/dashboard/guilds/GuildInformations.js'
import { okJson, errJson } from '../testHelpers.js'

export const STATUS = '/users/:discordID/guilds/:guildID/servers/:serverID/status'
export const PREVIEW = STATUS + '/preview'
export const CONFIGURATION = '/v6/guilds/:guildID/servers/:serverID/status/configuration'
export const revision = 'a'.repeat(64)
export const statusButton = (overrides = {}) => ({
  id: 1,
  name: 'Website',
  emoji: '🎮',
  url: 'https://example.com',
  enable: true,
  ...overrides,
})
export const configuration = (overrides = {}) => ({
  settings: { show_player_list_status: false, status_player_list_format: '{name}', show_status_chart: false },
  buttons: [statusButton()],
  ...overrides,
})
export function installNetwork(
  api: Mock,
  options: {
    status?: object
    configuration?: ReturnType<typeof configuration>
    failGet?: boolean
    failPreview?: boolean
  } = {},
) {
  guildChannelsMutate([{ id: 'c1', name: 'general', type: 0, position: 0, parentID: null }])
  const saved = { configuration: options.configuration ?? configuration(), revision }
  const network: Mock = vi.fn(async (_url: string, request?: RequestInit) => {
    if (request?.method === 'PUT')
      return {
        ...okJson({ ...JSON.parse(String(request.body)), revision: 'b'.repeat(64), sync: 'applied' }),
        status: 200,
      }
    return options.failGet ? { ...errJson(), status: 503 } : { ...okJson(saved), status: 200 }
  })
  vi.stubGlobal('fetch', network)
  api.mockImplementation(async (path: string, method: string, body: any) => {
    if (path === PREVIEW)
      return options.failPreview
        ? errJson()
        : okJson({
            bot: { name: 'Preview Bot', avatarUrl: null },
            online: true,
            embeds: [
              {
                title: body.settings?.show_player_list_status
                  ? body.settings.status_player_list_format
                  : 'Server status',
                color: 0,
                fields: [],
                timestamp: '2026-11-20T12:00:00.000Z',
                imageUrl: null,
              },
            ],
            buttonRows: [
              body.buttons
                ?.filter((button: any) => button.enable)
                .map((button: any) => ({ label: button.name, emoji: button.emoji, url: button.url })) ?? [],
            ],
          })
    if (path.endsWith('/channels')) return okJson([{ id: 'c1', name: 'general', type: 0, position: 0, parentID: null }])
    if (path === STATUS && method === 'GET') return okJson(options.status ?? {})
    if (path === STATUS && method === 'POST') return okJson({ channel: 'c1', message: 'm1' })
    return okJson({})
  })
  return network
}
export function renderStatus(guard = false) {
  return renderWithProviders(
    () =>
      guard ? (
        <DraftEditingProvider>
          <ServerStatus />
          <A href="/other">Other page</A>
        </DraftEditingProvider>
      ) : (
        <ServerStatus />
      ),
    {
      path: '/dashboard/guilds/:guildID/config/servers/:serverID/status',
      history: historyAt('/dashboard/guilds/g1/config/servers/s1/status'),
    },
  )
}
export function viewport(initialWide: boolean) {
  let wide = initialWide
  const query = Object.assign(new EventTarget(), { media: '(min-width: 1280px)' })
  Object.defineProperty(query, 'matches', { get: () => wide })
  vi.spyOn(window, 'matchMedia').mockReturnValue(query as unknown as MediaQueryList)
  return (next: boolean) => {
    wide = next
    query.dispatchEvent(new Event('change'))
  }
}
export const puts = (network: Mock) => network.mock.calls.filter(([, request]) => request?.method === 'PUT')
export const commands = (api: Mock) => api.mock.calls.filter(([path, method]) => method !== 'GET' && path !== PREVIEW)
