import { createEffect, createResource, createSignal, For, Show } from 'solid-js'
import { useLocation } from '@solidjs/router'
import { AdminIDSchema } from '@gmod/schema/admin/AdminDashboardSchema.js'
import { AdminServerPreviewsSchema } from '@gmod/schema/admin/AdminServerPreviewsSchema.js'
import { StatusMessagePreviewSchema } from '@gmod/schema/server/StatusMessagePreviewSchema.js'
import AdminPanel from '../../../components/AdminPanel.js'
import DiscordStatusPreview from '../../../components/discord/DiscordStatusPreview.js'
import DiscordMessagePreview from '../../../components/discord/DiscordMessagePreview.js'
import { AsyncState, Button, ButtonLink, CopyableValue, DateTime, FormField } from '../../../components/ui/index.js'
import { useI18n } from '../../../i18n.js'
import { adminGet } from './adminApi.js'

export default function ServerPreviews() {
  const { t, locale } = useI18n()
  const location = useLocation()
  const [input, setInput] = createSignal('')
  const [serverID, setServerID] = createSignal('')
  const [message, setMessage] = createSignal('')
  createEffect(() => {
    const id = new URLSearchParams(location.search).get('serverID') || ''
    setInput(id)
    setServerID(AdminIDSchema.safeParse(id).success ? id : '')
  })
  const [details, { refetch }] = createResource(
    () => serverID() || false,
    async (id) => {
      const value = AdminServerPreviewsSchema.parse(await adminGet(`/servers/${encodeURIComponent(id)}/previews`))
      if (value.server.id !== id) throw new Error('Unexpected preview server')
      return value
    },
  )
  const [status, { refetch: refreshStatus }] = createResource(
    () => (serverID() ? { id: serverID(), locale: locale() === 'fr' ? 'fr' : 'en' } : false),
    async ({ id, locale }) =>
      StatusMessagePreviewSchema.parse(await adminGet(`/servers/${encodeURIComponent(id)}/status-preview`, { locale })),
  )
  const data = () => (details.error ? undefined : details())
  return (
    <>
      <AdminPanel
        title={t('admin_previews.title', 'Server previews')}
        description={t(
          'admin_previews.description',
          'Inspect a server’s saved status and recent captures without publishing or changing its configuration.',
        )}
        icon="eye"
      >
        <form
          class="flex min-w-0 flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (AdminIDSchema.safeParse(input().trim()).success) {
              if (serverID() === input().trim()) {
                void refetch()
                void refreshStatus()
              } else setServerID(input().trim())
            }
          }}
        >
          <div class="min-w-0 basis-full sm:basis-64 sm:flex-1">
            <FormField id="admin-preview-server" label={t('admin_v6.server_id', 'Server ID')}>
              <input
                id="admin-preview-server"
                class="input w-full"
                value={input()}
                maxLength={255}
                onInput={(e) => setInput(e.currentTarget.value)}
              />
            </FormField>
          </div>
          <Button
            type="submit"
            loading={details.loading || status.loading}
            disabled={!AdminIDSchema.safeParse(input().trim()).success}
          >
            {t('admin_previews.load', 'Load previews')}
          </Button>
          <ButtonLink href="/dashboard/admins/servers">{t('admin_v6.game_servers', 'Game servers')}</ButtonLink>
        </form>
        <Show when={!serverID()}>
          <p class="text-sm text-base-content/65">
            {t(
              'admin_previews.choose',
              'Choose Preview in the game server directory, or enter a registered server ID.',
            )}
          </p>
        </Show>
        <Show when={serverID()}>
          <AsyncState loading={details.loading} error={details.error} onRetry={() => void refetch()}>
            <Show when={data()}>
              {(value) => (
                <div class="flex min-w-0 flex-wrap items-center gap-3">
                  <strong class="[overflow-wrap:anywhere]">{value().server.name}</strong>
                  <CopyableValue value={value().server.id} label={t('admin_v6.copy_server_id', 'Copy server ID')} />
                </div>
              )}
            </Show>
          </AsyncState>
        </Show>
      </AdminPanel>
      <Show when={serverID()}>
        <AdminPanel
          title={t('admin_previews.status', 'Saved status message')}
          description={t(
            'admin_previews.status_note',
            'Rendered from the effective saved configuration and latest server data. This does not confirm delivery to Discord.',
          )}
          actions={
            <Button size="sm" loading={status.loading} onClick={() => void refreshStatus()}>
              {t('admin_v6.refresh', 'Refresh')}
            </Button>
          }
        >
          <AsyncState loading={status.loading} error={status.error} onRetry={() => void refreshStatus()}>
            <Show when={!status.error && status()}>
              {(value) => (
                <DiscordStatusPreview
                  data={value()}
                  caption={t('admin_previews.read_only', 'Read-only preview. No Discord message is sent or changed.')}
                />
              )}
            </Show>
          </AsyncState>
        </AdminPanel>
        <AdminPanel
          title={t('admin_previews.screenshots', 'Recent screenshots')}
          description={t(
            'admin_previews.screenshots_note',
            'Raster images from the six most recent capture records. No new capture is requested.',
          )}
        >
          <AsyncState
            loading={details.loading}
            error={details.error}
            empty={!!data() && data()!.screenshots.length === 0}
            emptyLabel={t('admin_previews.no_screenshots', 'No supported screenshots in the latest capture records.')}
            onRetry={() => void refetch()}
          >
            <div class="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
              <For each={data()?.screenshots}>
                {(capture) => (
                  <figure class="min-w-0 rounded-lg border border-base-200 p-3">
                    <img
                      src={capture.url}
                      alt={capture.title || t('admin_previews.screenshot_alt', 'Game screenshot')}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      class="aspect-video w-full rounded object-contain"
                    />
                    <figcaption class="mt-2 text-sm [overflow-wrap:anywhere]">
                      {capture.title || t('admin_previews.screenshot_alt', 'Game screenshot')} ·{' '}
                      <DateTime value={capture.createdAt} />
                    </figcaption>
                  </figure>
                )}
              </For>
            </div>
          </AsyncState>
        </AdminPanel>
        <AdminPanel
          title={t('admin_previews.message', 'Message sandbox')}
          description={t(
            'admin_previews.message_note',
            'Try text and basic Discord formatting locally. This example is separate from saved templates and sends nothing.',
          )}
        >
          <FormField id="admin-preview-message" label={t('admin_previews.message_text', 'Example message')}>
            <textarea
              id="admin-preview-message"
              class="textarea w-full"
              maxLength={2000}
              value={message()}
              onInput={(event) => setMessage(event.currentTarget.value)}
            />
          </FormField>
          <DiscordMessagePreview
            author="Gmod Integration"
            content={message() || t('admin_previews.sample', '**Example player** joined the server.')}
            label={t('admin_previews.message_render', 'Example Discord message')}
          />
        </AdminPanel>
      </Show>
    </>
  )
}
