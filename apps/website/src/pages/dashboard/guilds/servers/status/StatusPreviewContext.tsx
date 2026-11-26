import {
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  useContext,
  type Accessor,
  type ParentComponent,
} from 'solid-js'
import { useParams } from '@solidjs/router'
import {
  StatusMessagePreviewSchema,
  type StatusMessagePreview,
  type StatusMessagePreviewInput,
  type StatusPreviewButton,
  type StatusPreviewSettings,
} from '@gmod/schema/server/StatusMessagePreviewSchema.js'
import { fetchAPI } from '../../../../../utils/api.js'
import { authSession } from '../../../../../utils/authClient.js'
import { useI18n } from '../../../../../i18n.js'

export type StatusPreviewContextValue = {
  setSettings: (settings: StatusPreviewSettings) => void
  setButtons: (buttons: StatusPreviewButton[] | undefined) => void
  preview: Accessor<StatusMessagePreview | undefined>
  loading: Accessor<boolean>
  error: Accessor<string | undefined>
  refetch: () => void
}

const StatusPreviewContext = createContext<StatusPreviewContextValue>()

function previewInputKey({ settings, buttons, ...draft }: StatusMessagePreviewInput): string {
  return JSON.stringify({
    ...draft,
    settings: Object.fromEntries(Object.entries(settings).sort(([a], [b]) => a.localeCompare(b))),
    // Persisted IDs do not affect Discord link buttons; saving a new button only assigns its ID.
    ...(buttons === undefined ? {} : { buttons: buttons.map(({ name, emoji, url }) => ({ name, emoji, url })) }),
  })
}

export const StatusPreviewProvider: ParentComponent = (props) => {
  const { t, locale } = useI18n()
  const params = useParams()
  const [settings, updateSettings] = createSignal<StatusPreviewSettings>({})
  const [buttons, updateButtons] = createSignal<StatusPreviewButton[] | undefined>()
  const [preview, setPreview] = createSignal<StatusMessagePreview>()
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string>()
  let generation = 0
  let active = true
  let timer: ReturnType<typeof setTimeout> | undefined
  let inputKey: string | undefined
  let inFlight = false
  let controller: AbortController | undefined
  let queued: { draft: StatusMessagePreviewInput; current: number } | undefined

  const input = (): StatusMessagePreviewInput => ({
    simulation: true,
    locale: locale(),
    settings: settings(),
    ...(buttons() === undefined
      ? {}
      : {
          buttons: buttons()!
            .filter((button) => button.enable)
            .slice(0, 25),
        }),
  })
  const key = (draft: StatusMessagePreviewInput) =>
    JSON.stringify([params.guildID, params.serverID, authSession()?.session.id, previewInputKey(draft)])

  async function request(draft: StatusMessagePreviewInput, current: number) {
    if (!active || current !== generation) return
    if (inFlight) {
      queued = { draft, current }
      return
    }
    inFlight = true
    controller = new AbortController()
    const requestController = controller
    const timeout = setTimeout(() => requestController.abort(), 30_000)
    try {
      const response = await fetchAPI(
        '/users/:discordID/guilds/:guildID/servers/:serverID/status/preview',
        'POST',
        draft,
        { signal: requestController.signal },
      )
      if (!response.ok) {
        let detail: unknown
        try {
          detail = await response.json()
        } catch {
          /* A transport error can have no JSON body. */
        }
        if (active && current === generation) {
          const serverError = detail && typeof detail === 'object' && 'error' in detail ? detail.error : undefined
          setError(
            serverError === 'provider_unavailable' || serverError === 'discord_service_unavailable'
              ? t(
                  'dashboard.server.status.preview.temporarily_unavailable',
                  'Discord is temporarily unavailable. Wait a moment, then try again.',
                )
              : typeof serverError === 'string' && serverError.length <= 500
                ? serverError
                : t('dashboard.server.status.preview.error', 'Unable to load the preview.'),
          )
        }
        return
      }
      const parsed = StatusMessagePreviewSchema.parse(await response.json())
      if (active && current === generation) setPreview(parsed)
    } catch {
      if (active && current === generation)
        setError(t('dashboard.server.status.preview.error', 'Unable to load the preview.'))
    } finally {
      clearTimeout(timeout)
      controller = undefined
      inFlight = false
      if (active && current === generation) setLoading(false)
      const next = queued
      queued = undefined
      if (next) void request(next.draft, next.current)
    }
  }

  createEffect(() => {
    const draft = input()
    const nextKey = key(draft)
    if (nextKey === inputKey) return
    inputKey = nextKey
    const current = ++generation
    clearTimeout(timer)
    setLoading(true)
    setError(undefined)
    timer = setTimeout(() => void request(draft, current), 250)
  })

  onCleanup(() => {
    active = false
    generation++
    clearTimeout(timer)
    queued = undefined
    controller?.abort()
  })

  const value: StatusPreviewContextValue = {
    setSettings: (next) => updateSettings((previous) => ({ ...previous, ...next })),
    setButtons: (next) =>
      updateButtons(
        next?.map(({ id, name, emoji, url, enable }) => ({
          ...(id === undefined ? {} : { id }),
          name,
          emoji,
          url,
          enable,
        })),
      ),
    preview,
    loading,
    error,
    refetch: () => {
      if (!active) return
      const draft = input()
      inputKey = key(draft)
      clearTimeout(timer)
      setLoading(true)
      setError(undefined)
      void request(draft, ++generation)
    },
  }

  return <StatusPreviewContext.Provider value={value}>{props.children}</StatusPreviewContext.Provider>
}

export const useStatusPreview = () => useContext(StatusPreviewContext)
