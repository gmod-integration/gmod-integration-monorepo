import { authenticatedFetch } from '../../../../../utils/authClient.js'
import { useFeatureAccess } from '../../../../../components/AccessProvider.js'
import {
  batch,
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
import { createAutosave } from '../../../../../hooks/createAutosave.js'
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

export type StatusScope = 'message' | 'buttons'

function configurationURL() {
  return `${getAPIUrl(false)}${getUrlWithActualParams('/v6/guilds/:guildID/servers/:serverID/status/configuration')}`
}

function createStatusConfiguration() {
  const { t } = useI18n()
  const chartAccess = useFeatureAccess('status.chart')
  const buttonAccess = useFeatureAccess('status.buttons')
  const preview = useStatusPreview()
  const [revision, setRevision] = createSignal('')
  const [saveError, setSaveError] = createSignal<Partial<Record<StatusScope, string>>>({})
  const [conflict, setConflict] = createSignal(false)
  const [conflictScope, setConflictScope] = createSignal<StatusScope>()
  const [syncPending, setSyncPending] = createSignal<Partial<Record<StatusScope, boolean>>>({})
  const [stagedButton, setStagedButton] = createSignal<{
    index: number | undefined
    button: StatusConfigurationButton
  }>()
  const errorMessage = (scope: StatusScope) =>
    saveError()[scope] || t('ui.save_error', 'Unable to save. Please try again.')
  const messageForm = createDraftForm<StatusConfiguration['settings']>({
    initial: defaultStatusConfiguration.settings,
    allowPendingEdits: true,
    validate: (settings) =>
      StatusConfigurationSchema.safeParse({ settings, buttons: [] }).success
        ? {}
        : { status_player_list_format: t('ui.invalid_value', 'Check the entered values.') },
    errorMessage: () => errorMessage('message'),
  })
  const buttonsForm = createDraftForm<Pick<StatusConfiguration, 'buttons'>>({
    initial: { buttons: [] },
    validate: ({ buttons }) =>
      StatusConfigurationSchema.safeParse({ settings: defaultStatusConfiguration.settings, buttons }).success
        ? {}
        : { buttons: t('editing.invalid_status', 'Check the button names and URLs before saving.') },
    errorMessage: () => errorMessage('buttons'),
  })
  // The preview combines both local drafts. Persistence always uses the sibling's saved values.
  const form = {
    draft: (): StatusConfiguration => ({ settings: messageForm.draft(), buttons: buttonsForm.draft().buttons }),
    saved: (): StatusConfiguration => ({ settings: messageForm.saved(), buttons: buttonsForm.saved().buttons }),
    dirty: () => messageForm.dirty() || buttonsForm.dirty(),
    pending: () => messageForm.pending() || buttonsForm.pending(),
    patch: (values: Partial<StatusConfiguration>) => {
      batch(() => {
        if (values.settings) messageForm.setDraft(values.settings)
        if (values.buttons) buttonsForm.patch({ buttons: values.buttons })
      })
    },
  }
  const formFor = (scope: StatusScope) => (scope === 'message' ? messageForm : buttonsForm)
  const [configuration, { refetch }] = createResource(async () => {
    const response = await authenticatedFetch(configurationURL(), {})
    if (!response.ok) throw new Error('Status configuration unavailable')
    return StatusConfigurationSnapshotSchema.parse(await response.json())
  })
  createEffect(
    on(
      () => configuration.state,
      () => {
        if (configuration.loading || configuration.error || !configuration()) return
        const snapshot = configuration()!
        batch(() => {
          messageForm.reset(snapshot.configuration.settings)
          buttonsForm.reset({ buttons: snapshot.configuration.buttons })
          setRevision(snapshot.revision)
          setConflict(false)
          setConflictScope(undefined)
          setSyncPending({})
        })
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
  const submission = (scope: StatusScope): StatusConfiguration => ({
    settings: scope === 'message' ? messageForm.draft() : messageForm.saved(),
    buttons: scope === 'buttons' ? buttonsForm.draft().buttons : buttonsForm.saved().buttons,
  })
  const validationError = (scope: StatusScope) => {
    if (StatusConfigurationSchema.safeParse(submission(scope)).success) return undefined
    return scope === 'message' && messageForm.valid()
      ? t(
          'editing.status_saved_buttons_invalid',
          'Repair and save the existing link buttons before saving the message.',
        )
      : scope === 'message'
        ? t('ui.invalid_value', 'Check the entered values.')
        : t('editing.invalid_status', 'Check the button names and URLs before saving.')
  }
  const accessError = (scope: StatusScope) => {
    const submitted = submission(scope)
    if (submitted.settings.show_status_chart && !messageForm.saved().show_status_chart && !chartAccess.allowed())
      return !chartAccess.ready() || chartAccess.snapshot()?.state !== 'ready'
        ? t('access.unavailable', 'Access could not be verified. Your saved configuration is preserved.')
        : t('access.upgrade_required', 'This feature requires Premium.')
    const limit = buttonAccess.limit()
    const buttons = submitted.buttons
    const savedIDs = new Set(buttonsForm.saved().buttons.map((button) => button.id))
    const createsButtons =
      buttons.length > buttonsForm.saved().buttons.length ||
      buttons.some((button) => button.id === undefined || !savedIDs.has(button.id))
    if (createsButtons && !buttonAccess.ready())
      return t('access.unavailable', 'Access could not be verified. Your saved configuration is preserved.')
    if (createsButtons && limit !== null && buttons.length > limit)
      return buttonAccess.snapshot()?.state !== 'ready'
        ? t('access.unavailable', 'Access could not be verified. Your saved configuration is preserved.')
        : t('access.quota_reached', 'You have reached the limit for this feature.')
    return undefined
  }
  async function persist(scope: StatusScope, submitted: StatusConfiguration) {
    const response = await authenticatedFetch(configurationURL(), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configuration: StatusConfigurationSchema.parse(submitted), revision: revision() }),
    })
    if (response.status === 403 || response.ok) refreshAccess()
    if (!response.ok) {
      if (response.status === 409) {
        setConflict(true)
        setConflictScope(scope)
        setSaveError((previous) => ({
          ...previous,
          [scope]: t('editing.conflict', 'The saved values changed. Reload them before saving again.'),
        }))
      }
      throw new Error('Status configuration save failed')
    }
    const accepted = StatusConfigurationSaveResponseSchema.parse(await response.json())
    setRevision(accepted.revision)
    setSyncPending((previous) => ({ ...previous, [scope]: accepted.sync === 'pending' }))
    setConflict(false)
    setConflictScope(undefined)
    preview?.refetch()
    return accepted.configuration
  }
  async function save(scope: StatusScope) {
    // A single revision protects the full configuration. Never allow two writes in flight.
    if (!ready() || form.pending() || stagedButton() || conflict() || validationError(scope) || accessError(scope))
      return false
    setSaveError((previous) => ({ ...previous, [scope]: undefined }))
    if (scope === 'message') {
      return messageForm.save(async (settings) => {
        const accepted = await persist(scope, { settings, buttons: buttonsForm.saved().buttons })
        if (!buttonsForm.dirty() && JSON.stringify(accepted.buttons) !== JSON.stringify(buttonsForm.saved().buttons))
          buttonsForm.reset({ buttons: accepted.buttons })
        return accepted.settings
      })
    }
    return buttonsForm.save(async ({ buttons }) => {
      const accepted = await persist(scope, { settings: messageForm.saved(), buttons })
      return { buttons: accepted.buttons }
    })
  }
  const canAutosave = (scope: StatusScope) =>
    ready() && !form.pending() && !stagedButton() && !conflict() && !validationError(scope) && !accessError(scope)
  const messageAutosave = createAutosave({
    form: messageForm,
    save: () => save('message'),
    enabled: () => canAutosave('message'),
  })
  const buttonsAutosave = createAutosave({
    form: buttonsForm,
    save: () => save('buttons'),
    enabled: () => canAutosave('buttons'),
  })
  return {
    form,
    messageForm,
    buttonsForm,
    formFor,
    autosaveFor: (scope: StatusScope) => (scope === 'message' ? messageAutosave : buttonsAutosave),
    ready,
    accessError,
    validationError,
    loading: () => configuration.loading,
    loadError: () => configuration.error,
    refetch,
    save,
    conflict,
    conflictScope,
    syncPending: (scope: StatusScope) => syncPending()[scope] === true,
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
