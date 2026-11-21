import { createSignal, createUniqueId, onCleanup, onMount, Show, type Component, type JSX } from 'solid-js'
import 'emoji-picker-element'
import ServerStatusButtons from './ServerStatusButtons.js'
import ServerStatusMessage from './ServerStatusMessage.js'
import { StatusPreviewProvider, useStatusPreview } from './StatusPreviewContext.js'
import DiscordStatusPreview from '../../../../../components/discord/DiscordStatusPreview.js'
import { AsyncState, Button, FormActions, Icon } from '../../../../../components/ui/index.js'
import { useI18n } from '../../../../../i18n.js'
import { StatusConfigurationProvider, useStatusConfiguration } from './StatusConfigurationContext.js'

const LivePreview: Component = () => {
  const preview = useStatusPreview()!
  return (
    <DiscordStatusPreview
      data={preview.preview()}
      loading={preview.loading()}
      error={preview.error()}
      onRetry={preview.refetch}
    />
  )
}

type StatusTab = 'configuration' | 'preview'

const StatusSaveActions: Component = () => {
  const editor = useStatusConfiguration()
  const { t } = useI18n()
  return (
    <div class="rounded-xl border border-base-200 bg-base-100 p-5">
      <AsyncState loading={editor.loading()} error={editor.loadError()} onRetry={() => void editor.refetch()} />
      <Show when={editor.syncPending()}>
        <p role="status" class="settings-notice">
          {t('editing.sync_pending', 'The configuration is saved. The Discord update has not been confirmed yet.')}
        </p>
      </Show>
      <Show when={editor.conflict()}>
        <Button onClick={() => void editor.refetch()}>
          {t('editing.reload_saved', 'Discard changes and reload saved values')}
        </Button>
      </Show>
      <FormActions
        dirty={editor.form.dirty()}
        pending={editor.form.pending()}
        disabled={!editor.ready() || !editor.form.valid()}
        error={editor.form.error()}
        success={editor.form.success()}
        onSave={() => void editor.save()}
        onCancel={editor.form.discard}
        saveLabel={t('editing.save_status', 'Save status configuration')}
        message={
          !editor.form.valid() && editor.ready()
            ? t('editing.invalid_status', 'Check the button names and URLs before saving.')
            : editor.form.dirty()
              ? t('editing.status_scope', 'Changes to the message and its buttons are saved together.')
              : undefined
        }
      />
    </div>
  )
}

const ServerStatus: Component = () => {
  const { t } = useI18n()
  const id = createUniqueId()
  const [selected, setSelected] = createSignal<StatusTab>('configuration')
  const [wide, setWide] = createSignal(false)
  let configurationTab!: HTMLButtonElement
  let previewTab!: HTMLButtonElement

  onMount(() => {
    const query = window.matchMedia('(min-width: 1280px)')
    const update = () => setWide(query.matches)
    update()
    query.addEventListener('change', update)
    onCleanup(() => query.removeEventListener('change', update))
  })

  const navigateTabs: JSX.EventHandler<HTMLButtonElement, KeyboardEvent> = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next =
      event.key === 'Home'
        ? 'configuration'
        : event.key === 'End'
          ? 'preview'
          : selected() === 'configuration'
            ? 'preview'
            : 'configuration'
    setSelected(next)
    ;(next === 'configuration' ? configurationTab : previewTab).focus()
  }

  return (
    <StatusPreviewProvider>
      <StatusConfigurationProvider>
        <div
          role="tablist"
          aria-label={t('dashboard.server.status.title', 'Server Status')}
          class="status-mobile-tabs flex min-w-0 gap-1 rounded-xl border border-base-content/10 bg-base-100 p-1 xl:hidden"
        >
          <Button
            ref={configurationTab}
            id={`${id}-configuration-tab`}
            role="tab"
            variant="ghost"
            size="sm"
            aria-controls={`${id}-configuration-panel`}
            aria-selected={selected() === 'configuration'}
            tabIndex={selected() === 'configuration' ? 0 : -1}
            data-active={selected() === 'configuration'}
            class="status-mobile-tab min-w-0 flex-1"
            onClick={() => setSelected('configuration')}
            onKeyDown={navigateTabs}
          >
            <Icon name="sliders-horizontal" size={15} />
            {t('dashboard.menu.servers.config', 'Configuration')}
          </Button>
          <Button
            ref={previewTab}
            id={`${id}-preview-tab`}
            role="tab"
            variant="ghost"
            size="sm"
            aria-label={t('dashboard.server.status.preview.title', 'Discord preview')}
            aria-controls={`${id}-preview-panel`}
            aria-selected={selected() === 'preview'}
            tabIndex={selected() === 'preview' ? 0 : -1}
            data-active={selected() === 'preview'}
            class="status-mobile-tab min-w-0 flex-1"
            onClick={() => setSelected('preview')}
            onKeyDown={navigateTabs}
          >
            <Icon name="messages-square" size={15} />
            {t('dashboard.server.pseudo.preview', 'Preview')}
          </Button>
        </div>
        <div class="status-editor-layout grid min-w-0 grid-cols-1 items-start gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.95fr)]">
          <div
            id={`${id}-configuration-panel`}
            role={wide() ? undefined : 'tabpanel'}
            aria-labelledby={wide() ? undefined : `${id}-configuration-tab`}
            hidden={!wide() && selected() !== 'configuration'}
            data-status-configuration
            class="status-editor-panel status-settings-stack min-w-0 flex-col gap-6"
            classList={{ flex: wide() || selected() === 'configuration' }}
          >
            <ServerStatusMessage />
            <ServerStatusButtons />
            <StatusSaveActions />
          </div>
          <div
            id={`${id}-preview-panel`}
            role={wide() ? undefined : 'tabpanel'}
            aria-labelledby={wide() ? undefined : `${id}-preview-tab`}
            hidden={!wide() && selected() !== 'preview'}
            class="status-editor-panel status-preview-panel min-w-0 xl:sticky xl:top-6"
          >
            <aside data-status-simulation aria-label={t('dashboard.server.status.preview.simulation', 'Simulation')}>
              <LivePreview />
            </aside>
          </div>
        </div>
      </StatusConfigurationProvider>
    </StatusPreviewProvider>
  )
}

export default ServerStatus
