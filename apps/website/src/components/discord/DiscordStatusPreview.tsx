import { Show, type Component } from 'solid-js'
import type { StatusMessagePreview } from '@gmod/schema/server/StatusMessagePreviewSchema.js'
import { useI18n } from '../../i18n.js'
import { Button, Icon } from '../ui/index.js'
import DiscordMessagePreview from './DiscordMessagePreview.js'

export { default as DiscordText } from './DiscordText.js'

interface DiscordStatusPreviewProps {
  data?: StatusMessagePreview
  loading?: boolean
  error?: string
  onRetry?: () => void
  caption?: string
}

const DiscordStatusPreview: Component<DiscordStatusPreviewProps> = (props) => {
  const { t } = useI18n()
  return (
    <section
      class="discord-preview-card flex min-w-0 w-full flex-col overflow-hidden rounded-2xl border border-base-content/10 bg-base-100 shadow-sm"
      aria-label={t('dashboard.server.status.preview.title', 'Discord preview')}
      aria-busy={props.loading}
    >
      <div class="discord-preview-header flex flex-wrap items-center justify-between gap-3 border-b border-base-content/8 px-5 py-4">
        <div class="flex items-center gap-3">
          <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon name="messages-square" size={18} />
          </span>
          <div class="flex flex-col gap-1.5">
            <h3 class="text-sm font-semibold">{t('dashboard.server.status.preview.title', 'Discord preview')}</h3>
            <Show when={props.data?.simulation}>
              <span class="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/8 px-2 py-0.5 text-[10px] font-medium text-primary">
                <Icon name="flask-conical" size={11} />
                {t('dashboard.server.status.preview.simulation', 'Simulation')}
              </span>
            </Show>
          </div>
        </div>
        <Show when={props.loading}>
          <span role="status" class="flex items-center gap-2 text-xs text-base-content/50">
            <Icon name="refresh-cw" size={13} class="animate-spin" />
            {t('dashboard.server.status.preview.loading', 'Updating preview…')}
          </span>
        </Show>
      </div>
      <div class="discord-preview-body flex min-w-0 flex-col gap-4 p-4 sm:p-5">
        <p class="text-xs leading-relaxed text-base-content/50">
          {props.caption ??
            t(
              'dashboard.server.status.preview.caption',
              'Settings and confirmed button changes are saved automatically and update an existing message. Publish to send a new message.',
            )}
        </p>
        <Show when={props.error}>
          <div role="alert" class="border border-base-200 rounded-lg p-3 flex flex-col gap-2 items-start">
            <p>{t('dashboard.server.status.preview.unavailable', 'Preview unavailable')}</p>
            <p class="text-sm text-base-content/60 break-words">{props.error}</p>
            <Show when={props.onRetry}>
              <Button type="button" size="sm" onClick={() => props.onRetry?.()} disabled={props.loading}>
                {t('ui.retry', 'Try again')}
              </Button>
            </Show>
          </div>
        </Show>
        <Show when={props.data}>
          {(data) => (
            <DiscordMessagePreview
              author={data().bot.name}
              avatarUrl={data().bot.avatarUrl}
              embeds={data().embeds}
              buttonRows={data().buttonRows}
              dimmed={props.loading || !!props.error}
            />
          )}
        </Show>
        <Show
          when={
            props.data?.accessState === 'unknown' ||
            props.data?.simulation ||
            (props.data && props.data.buttonRows.some((row) => row.length > 0))
          }
        >
          <div class="discord-preview-notes flex flex-col gap-2 border-t border-base-content/8 pt-3">
            <Show when={props.data?.accessState === 'unknown'}>
              <p class="flex items-start gap-2 text-xs leading-relaxed text-base-content/45">
                <Icon name="info" size={14} class="mt-0.5 shrink-0" />
                <span>
                  {t(
                    'dashboard.server.status.preview.local_access_unknown',
                    'Premium could not be verified locally. This preview uses the free limits.',
                  )}
                </span>
              </p>
            </Show>
            <Show when={props.data?.simulation}>
              <p class="flex items-start gap-2 text-xs leading-relaxed text-base-content/45">
                <Icon name="info" size={14} class="mt-0.5 shrink-0" />
                <span>
                  {t(
                    'dashboard.server.status.preview.simulation_note',
                    'Fictional players help you test the layout. Sending uses the server’s real data.',
                  )}
                </span>
              </p>
            </Show>
            <Show when={props.data && props.data.buttonRows.some((row) => row.length > 0)}>
              <p class="flex items-start gap-2 text-xs leading-relaxed text-base-content/45">
                <Icon name="mouse-pointer-2" size={14} class="mt-0.5 shrink-0" />
                <span>{t('dashboard.server.status.preview.buttons_note', 'Buttons are inactive in the preview.')}</span>
              </p>
            </Show>
          </div>
        </Show>
      </div>
    </section>
  )
}

export default DiscordStatusPreview
