import { type Component, createResource, createSignal, Show } from 'solid-js'
import { closeDialog, showDialog } from '../../../../../utils/dialog.js'
import AdminPanel from '../../../../../components/AdminPanel.js'
import AdminModal from '../../../../../components/AdminModal.js'
import ConfirmActionDialog from '../../../../../components/ConfirmActionDialog.js'
import { Button, FormActions, Icon, IconButton } from '../../../../../components/ui/index.js'
import { ChannelSelector } from '../../../../../components/AdminChannelSelector.js'
import { guildChannelsRefetch } from '../../GuildInformations.js'
import DiscordMessage from '../../../../../components/discord/DiscordMessage.js'
import DiscordStatusPreview from '../../../../../components/discord/DiscordStatusPreview.js'
import { fetchAPI } from '../../../../../utils/api.js'
import { createAsyncAction } from '../../../../../hooks/createAsyncAction.js'
import { useI18n } from '../../../../../i18n.js'
import { useStatusPreview } from './StatusPreviewContext.js'
import { useStatusConfiguration } from './StatusConfigurationContext.js'

const STATUS_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/status'
type PublishedStatus = { channel?: string; message?: string }

const ServerStatusPublication: Component = () => {
  const { t } = useI18n()
  const editor = useStatusConfiguration()
  const preview = useStatusPreview()
  const [selectedChannel, setSelectedChannel] = createSignal('')
  const [sendOpen, setSendOpen] = createSignal(false)
  const send = createAsyncAction({
    errorMessage: () => t('dashboard.server.status.preview.send_error', 'Unable to send the status message.'),
  })
  const [status, { mutate: setStatus, refetch }] = createResource(async (): Promise<PublishedStatus> => {
    const response = await fetchAPI(STATUS_URL, 'GET')
    if (!response.ok) throw new Error('Published status unavailable')
    return await response.json()
  })
  const unavailable = () => !editor.ready() || editor.form.pending() || send.pending()
  const publicationUnavailable = () => unavailable() || status.loading || !!status.error || editor.conflict()
  const previewUnavailable = () => !!preview && (preview.loading() || !!preview.error() || !preview.preview())
  async function publish() {
    if (
      publicationUnavailable() ||
      editor.form.dirty() ||
      previewUnavailable() ||
      !selectedChannel() ||
      selectedChannel() === '0'
    )
      return
    if (
      await send.run(async () => {
        const response = await fetchAPI(STATUS_URL, 'POST', { channelID: selectedChannel() })
        if (!response.ok) throw new Error('Status publication failed')
        setStatus(await response.json())
      })
    ) {
      closeDialog('select_channel_modal')
      setSendOpen(false)
    }
  }

  return (
    <>
      <AdminModal
        id="select_channel_modal"
        title={t('dashboard.server.status.send_status', 'Publish status message')}
        size="wide"
        busy={send.pending()}
        onClose={() => {
          setSendOpen(false)
          send.reset()
        }}
        onCancel={() => {
          if (!send.pending()) {
            setSendOpen(false)
            send.reset()
          }
        }}
      >
        <p class="text-sm text-base-content/70">
          {t(
            'dashboard.server.status.preview.confirm_send',
            'Choose a channel, review the preview, then send the message.',
          )}
        </p>
        <label class="flex flex-col gap-2">
          <span>{t('tools.select_channel', 'Select a Channel')}</span>
          <ChannelSelector callback={setSelectedChannel} idSelect={selectedChannel()} disabled={send.pending()} />
        </label>
        <Show when={sendOpen() && preview}>
          <DiscordStatusPreview
            data={preview!.preview()}
            loading={preview!.loading()}
            error={preview!.error()}
            onRetry={preview!.refetch}
          />
        </Show>
        <FormActions
          pending={send.pending()}
          error={send.error()}
          disabled={
            publicationUnavailable() ||
            editor.form.dirty() ||
            !selectedChannel() ||
            selectedChannel() === '0' ||
            previewUnavailable()
          }
          onSave={() => void publish()}
          onCancel={() => {
            closeDialog('select_channel_modal')
            setSendOpen(false)
          }}
          saveLabel={t('dashboard.server.status.preview.send', 'Send to Discord')}
        />
      </AdminModal>
      <ConfirmActionDialog
        id="remove-status-confirmation"
        title={t('dashboard.server.status.remove_status', 'Remove published message')}
        description={t(
          'editing.remove_status_help',
          'Remove the published Discord status message. The saved configuration is kept.',
        )}
        confirmLabel={t('dashboard.server.status.remove_status', 'Remove published message')}
        onConfirm={async () => {
          const response = await fetchAPI(STATUS_URL, 'DELETE')
          if (!response.ok) throw new Error('Status removal failed')
          setStatus({})
        }}
      />
      <AdminPanel
        title={t('dashboard.server.status.publication', 'Publish to Discord')}
        description={t(
          'dashboard.server.status.publication_description',
          'Publish the saved status message in a Discord channel, or remove the current message.',
        )}
      >
        <Show when={status.error}>
          <div role="alert" class="flex flex-wrap items-center gap-3 text-error">
            <span>{t('ui.load_error', 'Unable to load this content.')}</span>
            <Button size="sm" onClick={() => void refetch()}>
              {t('ui.retry', 'Try again')}
            </Button>
          </div>
        </Show>
        <div class="status-publication-card flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/15 bg-primary/5 p-4">
          <div class="flex min-w-0 items-center gap-3">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon name="send" size={19} />
            </span>
            <div class="flex min-w-0 flex-col gap-1">
              <span class="text-sm font-medium">{t('dashboard.server.status.status_message', 'Status Message')}</span>
              <Show
                when={!status.loading && !status.error && status()?.channel}
                fallback={
                  <span class="text-xs text-base-content/50">
                    {t('dashboard.server.status.no_status_message', 'No status message published')}
                  </span>
                }
              >
                <DiscordMessage messageID={status()?.message || ''} channelID={status()?.channel} />
              </Show>
            </div>
          </div>
          <Show
            when={!status.loading && !status.error && status()?.channel}
            fallback={
              <Button
                size="sm"
                variant="primary"
                disabled={publicationUnavailable() || editor.form.dirty()}
                onClick={() => {
                  setSelectedChannel('')
                  send.reset()
                  setSendOpen(true)
                  showDialog('select_channel_modal')
                  void guildChannelsRefetch()
                }}
              >
                <Icon name="plus" size={16} />
                {t('dashboard.server.status.send_status', 'Publish status message')}
              </Button>
            }
          >
            <IconButton
              label={t('dashboard.server.status.remove_status', 'Remove published message')}
              icon="trash-2"
              variant="danger"
              size="sm"
              disabled={publicationUnavailable()}
              onClick={() => showDialog('remove-status-confirmation')}
            />
          </Show>
        </div>
        <Show when={editor.form.dirty()}>
          <p class="settings-notice">
            {t('editing.publish_saved_first', 'Wait for your changes to finish saving before publishing a message.')}
          </p>
        </Show>
      </AdminPanel>
    </>
  )
}
export default ServerStatusPublication
