import { For, Show, type Component } from 'solid-js'
import type { StatusMessagePreview } from '@gmod/schema/server/StatusMessagePreviewSchema.js'
import { useI18n } from '../../i18n.js'
import DiscordText from './DiscordText.js'

export interface DiscordMessagePreviewProps {
  author: string
  avatarUrl?: string | null
  content?: string
  embeds?: StatusMessagePreview['embeds']
  buttonRows?: StatusMessagePreview['buttonRows']
  label?: string
  dimmed?: boolean
}

/** Local renderer for message text, embeds and inert buttons. It never fetches or publishes a message. */
const DiscordMessagePreview: Component<DiscordMessagePreviewProps> = (props) => {
  const { t, locale } = useI18n()
  const invisible = (name: string, value: string) => !`${name}${value}`.replace(/[\s\u200b]/g, '')
  const timestamp = (value: string) =>
    new Intl.DateTimeFormat(locale(), { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  return (
    <div
      role={props.label ? 'region' : undefined}
      aria-label={props.label}
      class="discord-message-preview rounded-xl p-3 sm:p-4 w-full min-w-0 bg-[#313338] text-[#dbdee1] shadow-inner ring-1 ring-black/10"
      classList={{ 'opacity-60': props.dimmed }}
      style={{ 'font-family': "'gg sans', 'Noto Sans', Helvetica, Arial, sans-serif" }}
    >
      <div class="flex gap-3 min-w-0">
        <Show
          when={props.avatarUrl}
          fallback={
            <span
              class="flex items-center justify-center w-9 h-9 shrink-0 rounded-full bg-[#5865f2] text-white font-bold"
              aria-hidden="true"
            >
              G
            </span>
          }
        >
          <img src={props.avatarUrl!} alt="" class="w-9 h-9 rounded-full shrink-0" />
        </Show>
        <div class="flex flex-col gap-2 min-w-0 flex-1">
          <div class="flex flex-wrap gap-1.5 items-center min-w-0">
            <span class="font-semibold text-[#f2f3f5] break-words">{props.author}</span>
            <span class="rounded px-1 text-xs font-semibold bg-[#5865f2] text-white">
              {t('dashboard.server.status.preview.app', 'APP')}
            </span>
          </div>
          <Show when={props.content}>
            <div class="whitespace-pre-wrap [overflow-wrap:anywhere]">
              <DiscordText text={props.content!} />
            </div>
          </Show>
          <For each={props.embeds}>
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
            <For each={props.buttonRows}>
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
  )
}

export default DiscordMessagePreview
