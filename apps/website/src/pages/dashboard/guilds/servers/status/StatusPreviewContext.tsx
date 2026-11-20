import {
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  useContext,
  type Accessor,
  type ParentComponent,
} from 'solid-js'
import {
  StatusMessagePreviewSchema,
  type StatusMessagePreview,
  type StatusMessagePreviewInput,
  type StatusPreviewButton,
  type StatusPreviewSettings,
} from '@gmod/schema/server/StatusMessagePreviewSchema.js'
import { fetchAPI } from '../../../../../utils/api.js'
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

export const StatusPreviewProvider: ParentComponent = (props) => {
  const { t, locale } = useI18n()
  const [settings, updateSettings] = createSignal<StatusPreviewSettings>({})
  const [buttons, updateButtons] = createSignal<StatusPreviewButton[] | undefined>()
  const [preview, setPreview] = createSignal<StatusMessagePreview>()
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string>()
  let generation = 0
  let active = true
  let timer: ReturnType<typeof setTimeout> | undefined

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

  async function request(draft: StatusMessagePreviewInput, current: number) {
    try {
      const response = await fetchAPI(
        '/users/:discordID/guilds/:guildID/servers/:serverID/status/preview',
        'POST',
        draft,
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
            typeof serverError === 'string' && serverError.length <= 500
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
      if (active && current === generation) setLoading(false)
    }
  }

  createEffect(() => {
    const draft = input()
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
      clearTimeout(timer)
      setLoading(true)
      setError(undefined)
      void request(input(), ++generation)
    },
  }

  return <StatusPreviewContext.Provider value={value}>{props.children}</StatusPreviewContext.Provider>
}

export const useStatusPreview = () => useContext(StatusPreviewContext)
