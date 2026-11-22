import { For, Match, Show, Switch, type Component } from 'solid-js'
import type { StatusMessagePreview } from '@gmod/schema/server/StatusMessagePreviewSchema.js'
import { useI18n } from '../../i18n.js'
import { Button, Icon } from '../ui/index.js'

interface DiscordStatusPreviewProps {
  data?: StatusMessagePreview
  loading?: boolean
  error?: string
  onRetry?: () => void
}

/** Small, safe subset of Discord formatting; message text is never interpreted as HTML. */
const DiscordText: Component<{ text: string }> = (props) => {
  const tokens = () => props.text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|__[^_\n]+__|~~[^~\n]+~~)/g)
  return (
    <For each={tokens()}>
      {(token) => (
        <Switch fallback={token}>
          <Match when={token.startsWith('**') && token.endsWith('**')}>
            <strong>{token.slice(2, -2)}</strong>
          </Match>
          <Match when={token.startsWith('`') && token.endsWith('`')}>
            <code class="rounded px-1 bg-black/20 font-mono">{token.slice(1, -1)}</code>
          </Match>
          <Match when={token.startsWith('__') && token.endsWith('__')}>
            <u>{token.slice(2, -2)}</u>
          </Match>
          <Match when={token.startsWith('~~') && token.endsWith('~~')}>
            <s>{token.slice(2, -2)}</s>
          </Match>
        </Switch>
      )}
    </For>
  )
}

const DiscordStatusPreview: Component<DiscordStatusPreviewProps> = (props) => {
  const { t, locale } = useI18n()
  const invisible = (name: string, value: string) => !`${name}${value}`.replace(/[\s\u200b]/g, '')
  const timestamp = (value: string) =>
    new Intl.DateTimeFormat(locale(), { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
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
          {t(
            'dashboard.server.status.preview.caption',
            'Edits update this preview only. Save to update the configuration and an existing message; publish to send a new message.',
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
            <div
              class="rounded-xl p-3 sm:p-4 w-full min-w-0 bg-[#313338] text-[#dbdee1] shadow-inner ring-1 ring-black/10"
              classList={{ 'opacity-60': props.loading || !!props.error }}
              style={{ 'font-family': "'gg sans', 'Noto Sans', Helvetica, Arial, sans-serif" }}
            >
              <div class="flex gap-3 min-w-0">
                <Show
                  when={data().bot.avatarUrl}
                  fallback={
                    <span
                      class="flex items-center justify-center w-9 h-9 shrink-0 rounded-full bg-[#5865f2] text-white font-bold"
                      aria-hidden="true"
                    >
                      G
                    </span>
                  }
                >
                  <img src={data().bot.avatarUrl!} alt="" class="w-9 h-9 rounded-full shrink-0" />
                </Show>
                <div class="flex flex-col gap-2 min-w-0 flex-1">
                  <div class="flex flex-wrap gap-1.5 items-center min-w-0">
                    <span class="font-semibold text-[#f2f3f5] break-words">{data().bot.name}</span>
                    <span class="rounded px-1 text-xs font-semibold bg-[#5865f2] text-white">
                      {t('dashboard.server.status.preview.app', 'APP')}
                    </span>
                  </div>
                  <For each={data().embeds}>
                    {(embed) => (
                      <article
                        class="bg-[#2b2d31] border-l-4 rounded p-3 flex flex-col gap-3 min-w-0 max-w-[520px]"
                        style={{ 'border-left-color': `#${embed.color.toString(16).padStart(6, '0')}` }}
                      >
                        <h4 class="text-base font-semibold text-[#f2f3f5] break-words">
                          <DiscordText text={embed.title} />
                        </h4>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-2 min-w-0 text-sm">
                          <For each={embed.fields}>
                            {(field) => (
                              <div
                                class={`min-w-0 ${field.inline ? '' : 'sm:col-span-3'} ${invisible(field.name, field.value) ? 'hidden sm:block' : ''}`}
                                aria-hidden={invisible(field.name, field.value) || undefined}
                              >
                                <div class="font-semibold text-[#f2f3f5] whitespace-pre-wrap [overflow-wrap:anywhere]">
                                  <DiscordText text={field.name} />
                                </div>
                                <div class="whitespace-pre-wrap [overflow-wrap:anywhere]">
                                  <DiscordText text={field.value} />
                                </div>
                              </div>
                            )}
                          </For>
                        </div>
                        <Show when={embed.imageUrl}>
                          <img
                            src={embed.imageUrl!}
                            alt={t('dashboard.server.status.preview.chart_alt', 'Server activity chart')}
                            class="rounded w-full h-auto"
                          />
                        </Show>
                        <time dateTime={embed.timestamp} class="text-xs text-[#b5bac1]">
                          {timestamp(embed.timestamp)}
                        </time>
                      </article>
                    )}
                  </For>
                  <div class="flex flex-col gap-1.5 max-w-[520px] min-w-0">
                    <For each={data().buttonRows}>
                      {(row) => (
                        <div class="flex flex-wrap gap-1.5 min-w-0">
                          <For each={row}>
                            {(button) => (
                              <button
                                type="button"
                                aria-disabled="true"
                                title={button.url}
                                class="inline-flex items-center justify-center gap-1.5 bg-[#4e5058] text-[#f2f3f5] rounded px-3 py-1.5 text-sm min-w-0 max-w-full cursor-default"
                                onClick={(event) => event.preventDefault()}
                              >
                                <Show when={button.emoji}>
                                  <span aria-hidden="true">{button.emoji}</span>
                                </Show>
                                <span class="[overflow-wrap:anywhere] whitespace-normal">{button.label}</span>
                              </button>
                            )}
                          </For>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Show>
        <Show when={props.data?.simulation || (props.data && props.data.buttonRows.some((row) => row.length > 0))}>
          <div class="discord-preview-notes flex flex-col gap-2 border-t border-base-content/8 pt-3">
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
