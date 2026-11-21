import { useFeatureAccess } from '../../../../../components/AccessProvider.js'
import {
  createContext,
  createEffect,
  createResource,
  createSignal,
  on,
  useContext,
  type ParentComponent,
} from 'solid-js'
import {
  StatusConfigurationSchema,
  StatusConfigurationSnapshotSchema,
  StatusConfigurationSaveResponseSchema,
  type StatusConfiguration,
  type StatusConfigurationButton,
} from '@gmod/schema/server/StatusConfigurationSchema.js'
import { createDraftForm } from '../../../../../hooks/createDraftForm.js'
import { refreshAccess } from '../../../../../utils/accessEvents.js'
import { getAPIUrl, getUrlWithActualParams } from '../../../../../utils/api.js'
import { useI18n } from '../../../../../i18n.js'
import { useStatusPreview } from './StatusPreviewContext.js'

export const defaultStatusConfiguration: StatusConfiguration = {
  settings: {
    show_player_list_status: false,
    status_player_list_format: '{connectTime} - {name}',
    show_status_chart: false,
  },
  buttons: [],
}

function configurationURL() {
  return `${getAPIUrl(false)}${getUrlWithActualParams('/v6/guilds/:guildID/servers/:serverID/status/configuration')}`
}

function createStatusConfiguration() {
  const { t } = useI18n()
  const chartAccess = useFeatureAccess('status.chart')
  const buttonAccess = useFeatureAccess('status.buttons')
  const preview = useStatusPreview()
  const [revision, setRevision] = createSignal('')
  const [saveError, setSaveError] = createSignal('')
  const [conflict, setConflict] = createSignal(false)
  const [syncPending, setSyncPending] = createSignal(false)
  const [stagedButton, setStagedButton] = createSignal<{
    index: number | undefined
    button: StatusConfigurationButton
  }>()
  const form = createDraftForm<StatusConfiguration>({
    initial: defaultStatusConfiguration,
    validate: (draft) =>
      StatusConfigurationSchema.safeParse(draft).success
        ? {}
        : { buttons: t('ui.invalid_value', 'Check the entered values.') },
    errorMessage: () => saveError() || t('ui.save_error', 'Unable to save. Please try again.'),
  })
  const [configuration, { refetch }] = createResource(async () => {
    const response = await fetch(configurationURL(), {
      headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
    })
    if (!response.ok) throw new Error('Status configuration unavailable')
    return StatusConfigurationSnapshotSchema.parse(await response.json())
  })
  createEffect(
    on(
      () => configuration.state,
      () => {
        if (configuration.loading || configuration.error || !configuration()) return
        const snapshot = configuration()!
        form.reset(snapshot.configuration)
        setRevision(snapshot.revision)
        setConflict(false)
        setSyncPending(false)
      },
    ),
  )
  createEffect(() => {
    const draft = form.draft()
    const staging = stagedButton()
    const buttons = draft.buttons.map((button, index) => (staging?.index === index ? staging.button : button))
    if (staging && staging.index === undefined) buttons.push(staging.button)
    preview?.setSettings(draft.settings)
    preview?.setButtons(buttons)
  })
  const ready = () => !configuration.loading && !configuration.error && !!configuration()
  const accessError = () => {
    if (form.draft().settings.show_status_chart && !form.saved().settings.show_status_chart && !chartAccess.allowed())
      return !chartAccess.ready() || chartAccess.snapshot()?.state !== 'ready'
        ? t('access.unavailable', 'Access could not be verified. Your saved configuration is preserved.')
        : t('access.upgrade_required', 'This feature requires Premium.')
    const limit = buttonAccess.limit()
    const buttons = form.draft().buttons
    const savedIDs = new Set(form.saved().buttons.map((button) => button.id))
    const createsButtons =
      buttons.length > form.saved().buttons.length ||
      buttons.some((button) => button.id === undefined || !savedIDs.has(button.id))
    if (createsButtons && !buttonAccess.ready())
      return t('access.unavailable', 'Access could not be verified. Your saved configuration is preserved.')
    if (createsButtons && limit !== null && buttons.length > limit)
      return buttonAccess.snapshot()?.state !== 'ready'
        ? t('access.unavailable', 'Access could not be verified. Your saved configuration is preserved.')
        : t('access.quota_reached', 'You have reached the limit for this feature.')
    return undefined
  }
  async function save() {
    if (!ready() || stagedButton() || accessError()) return false
    setSaveError('')
    return form.save(async (draft) => {
      const response = await fetch(configurationURL(), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
        body: JSON.stringify({ configuration: StatusConfigurationSchema.parse(draft), revision: revision() }),
      })
      if (response.status === 403 || response.ok) refreshAccess()
      if (!response.ok) {
        if (response.status === 409) {
          setConflict(true)
          setSaveError(t('editing.conflict', 'The saved values changed. Reload them before saving again.'))
        }
        throw new Error('Status configuration save failed')
      }
      const accepted = StatusConfigurationSaveResponseSchema.parse(await response.json())
      setRevision(accepted.revision)
      setSyncPending(accepted.sync === 'pending')
      setConflict(false)
      preview?.refetch()
      return accepted.configuration
    })
  }
  return {
    form,
    ready,
    accessError,
    loading: () => configuration.loading,
    loadError: () => configuration.error,
    refetch,
    save,
    conflict,
    syncPending,
    stageButton: setStagedButton,
  }
}

type StatusConfigurationContextValue = ReturnType<typeof createStatusConfiguration>
const StatusConfigurationContext = createContext<StatusConfigurationContextValue>()
export const StatusConfigurationProvider: ParentComponent = (props) => (
  <StatusConfigurationContext.Provider value={createStatusConfiguration()}>
    {props.children}
  </StatusConfigurationContext.Provider>
)
export function useStatusConfiguration() {
  const value = useContext(StatusConfigurationContext)
  if (!value) throw new Error('StatusConfigurationProvider is required')
  return value
}
