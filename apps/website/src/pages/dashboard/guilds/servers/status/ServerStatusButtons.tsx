import { closeDialog, showDialog } from '../../../../../utils/dialog.js'
import { type Component, createEffect, createResource, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import type { StatusPreviewButton } from '@gmod/schema/server/StatusMessagePreviewSchema.js'
import AdminPanel from '../../../../../components/AdminPanel'
import { useI18n } from '../../../../../i18n'
import { LinkValue } from '../../../../../components/popup/LinkValue'
import { BuyPremiumBtn } from '../../../../../utils/premium'
import { fetchAPI } from '../../../../../utils/api'
import AdminModal from '../../../../../components/AdminModal'
import DiscordStatusPreview from '../../../../../components/discord/DiscordStatusPreview.js'
import { useStatusPreview } from './StatusPreviewContext.js'
import { Button, FormActions, FormField, Icon, IconButton, TableState } from '../../../../../components/ui/index.js'
import { createAsyncAction } from '../../../../../hooks/createAsyncAction.js'

//show_player_list_status
class StatusButton {
  id: number
  emoji: string
  name: string
  url: string
  enable: boolean

  constructor(id: number, emoji: string, name: string, url: string, enable: boolean) {
    this.id = id
    this.emoji = emoji
    this.name = name
    this.url = url
    this.enable = enable
  }
}

const fetchStatusButtons = async () => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/status/buttons', 'GET')
  if (!res.ok) {
    throw new Error('Status buttons request failed')
  }
  return await res.json()
}

const ServerStatusButtons: Component = () => {
  const { t } = useI18n()
  const statusPreview = useStatusPreview()
  const [statusButtons, { mutate, refetch }] = createResource('statusButtons', fetchStatusButtons)
  const [selectStatusButton, setSelectStatusButton] = createSignal(new StatusButton(0, '', '', '', false))
  const [visibleEmojiPicker, setVisibleEmojiPicker] = createSignal(false)
  const [editing, setEditing] = createSignal(false)
  const [saving, setSaving] = createSignal(false)
  const [saveError, setSaveError] = createSignal(false)
  const mutation = createAsyncAction({ errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.') })

  const persistedButtons = (): StatusButton[] => {
    if (statusButtons.error) return []
    return Array.isArray(statusButtons()) ? statusButtons() : []
  }
  const previewButton = (button: StatusButton): StatusPreviewButton => ({
    id: button.id,
    name: button.name,
    emoji: button.emoji,
    url: button.url,
    enable: button.enable,
  })
  createEffect(() => {
    if (!statusPreview) return
    if (statusButtons.loading || statusButtons.error) {
      statusPreview.setButtons(undefined)
      return
    }
    const draft = editing() ? selectStatusButton() : undefined
    statusPreview.setButtons(
      persistedButtons().map((button) => previewButton(draft && draft.id === button.id ? draft : button)),
    )
  })

  function discardDraft() {
    setEditing(false)
    setVisibleEmojiPicker(false)
    setSaveError(false)
  }
  onMount(() => {
    const modal = document.getElementById('edit_status_button')!
    modal.addEventListener('close', discardDraft)
    modal.addEventListener('cancel', discardDraft)
    onCleanup(() => {
      modal.removeEventListener('close', discardDraft)
      modal.removeEventListener('cancel', discardDraft)
    })
  })
  onCleanup(() => statusPreview?.setButtons(undefined))

  function openEditor(button: StatusButton) {
    setSelectStatusButton(new StatusButton(button.id, button.emoji, button.name, button.url, button.enable))
    setVisibleEmojiPicker(false)
    setSaveError(false)
    setEditing(true)
    showDialog('edit_status_button')
  }

  const previewReady = () =>
    !statusPreview || (!statusPreview.loading() && !statusPreview.error() && !!statusPreview.preview())

  async function saveDraft() {
    if (saving() || !previewReady()) return
    setSaving(true)
    setSaveError(false)
    try {
      const saved = await editStatusButton(selectStatusButton())
      if (!saved) {
        setSaveError(true)
        return
      }
      discardDraft()
      closeDialog('edit_status_button')
    } catch {
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  const createStatusButton = async () => {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/status/buttons', 'POST')
    if (!res.ok) {
      throw new Error('Status button creation failed')
    }
    const button = await res.json()
    const newButton = new StatusButton(button.id, button.emoji, button.name, button.url, button.enable)
    // Bug fix: `prevButtons` can be a non-array (e.g. `{}`, from fetchStatusButtons' error-path
    // fallback) if the initial GET failed. The old `prevButtons ? [...prevButtons, newButton] : []`
    // both threw (spreading a non-iterable object is a TypeError, surfacing as an unhandled
    // rejection since this onClick handler never awaits/catches this promise) and, even in its
    // intended "no previous list" fallback, discarded the just-created button instead of keeping it.
    mutate((prevButtons) => (Array.isArray(prevButtons) ? [...prevButtons, newButton] : [newButton]))
    return button
  }

  const deleteStatusButton = async (button: StatusButton) => {
    const res = await fetchAPI(
      `/users/:discordID/guilds/:guildID/servers/:serverID/status/buttons/${button.id}`,
      'DELETE',
    )
    if (!res.ok) {
      throw new Error('Status button removal failed')
    }
    mutate(persistedButtons().filter((existing) => existing.id !== button.id))
  }

  const editStatusButton = async (button: StatusButton) => {
    const res = await fetchAPI(
      `/users/:discordID/guilds/:guildID/servers/:serverID/status/buttons/${button.id}`,
      'PUT',
      button,
    )
    if (!res.ok) {
      return
    }
    const newButton = await res.json()
    mutate(persistedButtons().map((existing) => (existing.id === newButton.id ? newButton : existing)))
    return newButton
  }

  const handleEmojiClick = (event: CustomEvent) => {
    setSelectStatusButton({ ...selectStatusButton(), emoji: event.detail.unicode })
    setVisibleEmojiPicker(false)
  }

  return (
    <>
      <AdminModal
        title={t('dashboard.server.status.edit_button', 'Edit Button')}
        id="edit_status_button"
        busy={saving()}
      >
        <FormField id="status-button-emoji" label={t('dashboard.server.status.select_emoji', 'Select an Emoji')}>
          <button
            id="status-button-emoji"
            type="button"
            class="input text-left"
            disabled={saving()}
            onClick={() => setVisibleEmojiPicker(!visibleEmojiPicker())}
          >
            {selectStatusButton().emoji}
          </button>
          <Show when={visibleEmojiPicker() && !saving()}>
            {/*// @ts-expect-error -- intentional: legacy typing gap*/}
            <emoji-picker emoji-version="12.0" onEmoji-click={handleEmojiClick}></emoji-picker>
          </Show>
        </FormField>

        <FormField id="status-button-name" label={t('dashboard.server.status.button_name', 'Button Name')}>
          <input
            id="status-button-name"
            type="text"
            class="input"
            maxLength={80}
            disabled={saving()}
            value={selectStatusButton().name}
            onInput={(e) => setSelectStatusButton({ ...selectStatusButton(), name: e.currentTarget.value })}
          />
        </FormField>

        <FormField id="status-button-url" label={t('dashboard.server.status.button_url', 'Button URL')}>
          <input
            id="status-button-url"
            type="text"
            class="input"
            maxLength={2048}
            disabled={saving()}
            value={selectStatusButton().url}
            onInput={(e) => setSelectStatusButton({ ...selectStatusButton(), url: e.currentTarget.value })}
          />
        </FormField>

        <FormField id="status-button-active" label={t('dashboard.server.status.button_action', 'Button Action')}>
          <select
            id="status-button-active"
            class="select"
            disabled={saving()}
            value={selectStatusButton().enable ? 'true' : 'false'}
            onChange={(e) => {
              setSelectStatusButton({ ...selectStatusButton(), enable: e.currentTarget.value === 'true' })
            }}
          >
            <option value="true">{t('dashboard.server.status.yes', 'Yes')}</option>
            <option value="false">{t('dashboard.server.status.no', 'No')}</option>
          </select>
        </FormField>

        <Show when={statusPreview}>
          <DiscordStatusPreview
            data={statusPreview?.preview()}
            loading={statusPreview?.loading()}
            error={statusPreview?.error()}
            onRetry={statusPreview?.refetch}
          />
        </Show>
        <Show when={saveError()}>
          <p role="alert" class="text-error">
            {t('dashboard.server.status.button_save_failed', 'Unable to save this button. Try again.')}
          </p>
        </Show>
        <FormActions
          pending={saving()}
          disabled={!previewReady()}
          onSave={saveDraft}
          onCancel={() => {
            discardDraft()
            closeDialog('edit_status_button')
          }}
        />
      </AdminModal>

      <AdminPanel
        title={t('dashboard.server.status.status_buttons', 'Status Buttons')}
        description={t(
          'dashboard.server.status.status_buttons_description',
          'Add utility buttons to your server status message.',
        )}
        type="none"
      >
        <div class="min-w-0 w-full overflow-x-auto">
          <table class="status-buttons-table table rounded-none">
            <thead>
              <tr class="text-l">
                <th>{t('dashboard.server.status.button_icon', 'Icon')}</th>
                <th>{t('dashboard.server.status.button_name', 'Name')}</th>
                <th>{t('dashboard.server.status.button_url', 'URL')}</th>
                <th class="w-1/6 text-center">{t('dashboard.server.status.active', 'Active')}</th>
                <th class="w-1/6 text-center">{t('dashboard.server.status.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {/* Bug fix: `!statusButtons.loading` alone is also true once the fetch settles into an
                error, so reading `statusButtons()` below would throw (a resource re-throws its
                stored error when read) before the `<Match when={statusButtons.error}>` below ever
                gets a chance to render - crashing the whole page instead of showing that message. */}
              <TableState
                colSpan={5}
                loading={statusButtons.loading}
                error={statusButtons.error}
                errorLabel={t('dashboard.server.status.failed_to_load', 'Failed to load the links')}
                empty={!statusButtons.loading && !statusButtons.error && persistedButtons().length === 0}
                onRetry={() => refetch()}
              >
                <For each={persistedButtons()}>
                  {(button) => (
                    <tr>
                      <td>{button.emoji}</td>
                      <td>
                        <span class="inline-flex max-w-full items-center rounded-lg border border-base-content/10 bg-base-200/50 px-3 py-1.5 text-sm font-medium [overflow-wrap:anywhere]">
                          {button.name}
                        </span>
                      </td>
                      <td>
                        <LinkValue url={button.url} />
                      </td>
                      <td>
                        <div class="flex gap-2 justify-center">
                          {button.enable ? (
                            <span class="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                              <Icon name="check" size={13} />
                              {t('dashboard.server.status.yes', 'Yes')}
                            </span>
                          ) : (
                            <span class="inline-flex items-center gap-1.5 rounded-full bg-base-200/70 px-2.5 py-1 text-xs text-base-content/45">
                              <Icon name="x" size={13} />
                              {t('dashboard.server.status.no', 'No')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div class="flex gap-2 justify-center">
                          <div class="tooltip tooltip-info" data-tip={t('dashboard.server.status.edit', 'Edit')}>
                            <IconButton
                              label={t('dashboard.server.status.edit', 'Edit')}
                              icon="pencil"
                              disabled={mutation.pending()}
                              onClick={() => openEditor(button)}
                            />
                          </div>
                          <div class="tooltip tooltip-error" data-tip={t('dashboard.server.status.delete', 'Delete')}>
                            <IconButton
                              label={t('dashboard.server.status.delete', 'Delete')}
                              icon="trash-2"
                              variant="danger"
                              disabled={mutation.pending()}
                              onClick={() => void mutation.run(() => deleteStatusButton(button))}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </For>
              </TableState>
            </tbody>
          </table>
        </div>

        <Show when={mutation.error()}>
          <p role="alert" class="px-4 text-sm text-error">
            {mutation.error()}
          </p>
        </Show>

        <div class="flex gap-4 p-4">
          <BuyPremiumBtn
            subCondition={persistedButtons().length < 3}
            btnText={t('dashboard.server.status.premium', 'Limited to 3 buttons for free users.')}
            hidden={statusButtons.loading}
          >
            <Button
              variant="primary"
              loading={mutation.pending()}
              disabled={statusButtons.loading || !!statusButtons.error}
              onClick={() => void mutation.run(createStatusButton)}
            >
              <Icon name="plus" size={17} />
              {t('dashboard.server.status.add_button', 'Add Button')}
            </Button>
          </BuyPremiumBtn>
        </div>
      </AdminPanel>
    </>
  )
}

export default ServerStatusButtons
