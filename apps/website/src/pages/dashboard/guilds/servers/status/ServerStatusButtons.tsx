import { closeDialog, showDialog } from '../../../../../utils/dialog.js'
import {
  type Component,
  createEffect,
  createResource,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from 'solid-js'
import type { StatusPreviewButton } from '@gmod/schema/server/StatusMessagePreviewSchema.js'
import AdminPanel from '../../../../../components/AdminPanel'
import { useI18n } from '../../../../../i18n'
import { LinkValue } from '../../../../../components/popup/LinkValue'
import { TextValue } from '../../../../../components/popup/TextValue'
import { BuyPremiumBtn } from '../../../../../utils/premium'
import { fetchAPI } from '../../../../../utils/api'
import AdminModal from '../../../../../components/AdminModal'
import DiscordStatusPreview from '../../../../../components/discord/DiscordStatusPreview.js'
import { useStatusPreview } from './StatusPreviewContext.js'

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
    return {}
  }
  return await res.json()
}

const ServerStatusButtons: Component = () => {
  const { t } = useI18n()
  const statusPreview = useStatusPreview()
  const [statusButtons, { mutate }] = createResource('statusButtons', fetchStatusButtons)
  const [selectStatusButton, setSelectStatusButton] = createSignal(new StatusButton(0, '', '', '', false))
  const [visibleEmojiPicker, setVisibleEmojiPicker] = createSignal(false)
  const [editing, setEditing] = createSignal(false)
  const [saving, setSaving] = createSignal(false)
  const [saveError, setSaveError] = createSignal(false)

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
      return
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
      return
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
      <AdminModal title={t('dashboard.server.status.edit_button', 'Edit Button')} id="edit_status_button">
        <div class="fieldset">
          <label class="label">
            <span>{t('dashboard.server.status.select_emoji', 'Select an Emoji')}</span>
          </label>
          <button
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
        </div>

        <div class="fieldset">
          <label class="label">
            <span>{t('dashboard.server.status.button_name', 'Button Name')}</span>
          </label>
          <input
            type="text"
            class="input"
            maxLength={80}
            disabled={saving()}
            value={selectStatusButton().name}
            onInput={(e) => setSelectStatusButton({ ...selectStatusButton(), name: e.currentTarget.value })}
          />
        </div>

        <div class="fieldset">
          <label class="label">
            <span>{t('dashboard.server.status.button_url', 'Button URL')}</span>
          </label>
          <input
            type="text"
            class="input"
            maxLength={2048}
            disabled={saving()}
            value={selectStatusButton().url}
            onInput={(e) => setSelectStatusButton({ ...selectStatusButton(), url: e.currentTarget.value })}
          />
        </div>

        <div class="fieldset">
          <label class="label">
            <span>{t('dashboard.server.status.button_action', 'Button Action')}</span>
          </label>
          <select
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
        </div>

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
        <div class="flex flex-wrap gap-2 mt-2">
          <button type="button" class="btn btn-base-200" disabled={saving() || !previewReady()} onClick={saveDraft}>
            <Show when={saving()}>
              <span class="loading loading-spinner loading-sm" aria-hidden="true"></span>
            </Show>
            {t('dashboard.server.status.save', 'Save')}
          </button>
          <button
            type="button"
            class="btn btn-ghost"
            disabled={saving()}
            onClick={() => {
              discardDraft()
              closeDialog('edit_status_button')
            }}
          >
            {t('dashboard.server.status.cancel', 'Cancel')}
          </button>
        </div>
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
          <table class="table border-b border-base-300 rounded-none">
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
              <Show when={!statusButtons.loading && !statusButtons.error}>
                <For each={persistedButtons()}>
                  {(button) => (
                    <tr>
                      <td>{button.emoji}</td>
                      <td>
                        <TextValue value={button.name} />
                      </td>
                      <td>
                        <LinkValue url={button.url} />
                      </td>
                      <td>
                        <div class="flex gap-2 justify-center">
                          {button.enable ? (
                            <i class="fa-solid fa-check text-success"></i>
                          ) : (
                            <i class="fa-solid fa-times text-error"></i>
                          )}
                        </div>
                      </td>
                      <td>
                        <div class="flex gap-2 justify-center">
                          <div class="tooltip tooltip-info" data-tip={t('dashboard.server.status.edit', 'Edit')}>
                            <i class="hover:cursor-pointer fa-solid fa-edit" onClick={() => openEditor(button)}></i>
                          </div>
                          <div class="tooltip tooltip-error" data-tip={t('dashboard.server.status.delete', 'Delete')}>
                            <i
                              class="hover:cursor-pointer fa-solid fa-trash text-error"
                              onClick={() => deleteStatusButton(button)}
                            ></i>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </For>
              </Show>
            </tbody>
          </table>
        </div>

        <Switch>
          <Match when={statusButtons.loading}>
            <div class="flex justify-center h-36">
              <div class="loading loading-spinner loading-lg"></div>
            </div>
          </Match>
          <Match when={statusButtons.error}>
            <p role="alert" class="p-4">
              {t('dashboard.server.status.failed_to_load', 'Failed to load the links')}
            </p>
          </Match>
        </Switch>

        <div class="flex gap-4 p-4">
          <BuyPremiumBtn
            subCondition={persistedButtons().length < 3}
            btnText={t('dashboard.server.status.premium', 'Limited to 3 buttons for free users.')}
            hidden={statusButtons.loading}
          >
            <button class="btn btn-base-200" disabled={statusButtons.loading} onClick={() => createStatusButton()}>
              {t('dashboard.server.status.add_button', 'Add Button')}
            </button>
          </BuyPremiumBtn>
        </div>
      </AdminPanel>
    </>
  )
}

export default ServerStatusButtons
