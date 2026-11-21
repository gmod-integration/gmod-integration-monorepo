import { createEffect, createSignal, For, Show, type Component, type ParentProps } from 'solid-js'
import AdminModal from './AdminModal.js'
import { AsyncState, FormActions } from './ui/index.js'
import { guildChannels, guildChannelsRefetch } from '../pages/dashboard/guilds/GuildInformations.js'
import { createAsyncAction } from '../hooks/createAsyncAction.js'
import { useI18n } from '../i18n.js'
import { closeDialog } from '../utils/dialog.js'
import type { TypeDiscordChannel } from '../utils/types/DiscordTypes.js'

interface ChannelSelectorProps extends ParentProps {
  callback?: (channelID: string) => void
  /** @deprecated Selection never closes a dialog; confirm through AdminChannelSelector. */
  hasModal?: boolean
  /** @deprecated Selection never closes a dialog; confirm through AdminChannelSelector. */
  modalId?: string
  idSelect?: string
  onlyTextChannel?: boolean
  disabled?: boolean
}

const CHANNEL_TYPE_CATEGORY = 4

function getChannelType(channel: TypeDiscordChannel): number {
  const parsed = Number(channel.type)
  return Number.isNaN(parsed) ? -1 : parsed
}

function getChannelPosition(channel: TypeDiscordChannel): number {
  return channel.position ?? Number.MAX_SAFE_INTEGER
}

function isCategoryChannel(channel: TypeDiscordChannel): boolean {
  return getChannelType(channel) === CHANNEL_TYPE_CATEGORY
}

export const ChannelSelector: Component<ChannelSelectorProps> = (props) => {
  const { t } = useI18n()
  const onlyTextChannel = props.onlyTextChannel ?? true

  function getUniqueCategories(channels: TypeDiscordChannel[]) {
    return channels
      .filter((channel) => isCategoryChannel(channel))
      .sort((a, b) => getChannelPosition(a) - getChannelPosition(b))
      .map((channel) => ({ id: channel.id, name: channel.name }))
  }

  function getChannelsByCategory(channels: TypeDiscordChannel[], categoryID: string) {
    return channels
      .filter((channel) => channel.parentID === categoryID)
      .sort((a, b) => getChannelPosition(a) - getChannelPosition(b))
  }

  function getSelectableChannels(channels: TypeDiscordChannel[]) {
    return channels
      .filter((channel) => {
        if (isCategoryChannel(channel)) return false
        if (!onlyTextChannel) return true
        return channel.textBased !== false
      })
      .sort((a, b) => getChannelPosition(a) - getChannelPosition(b))
  }

  function getNoCategoryChannels(channels: TypeDiscordChannel[]) {
    return channels.filter((channel) => !channel.parentID).sort((a, b) => getChannelPosition(a) - getChannelPosition(b))
  }

  return (
    <AsyncState
      loading={guildChannels.loading}
      error={!!guildChannels.error}
      errorLabel={t('ui.load_error', 'Unable to load the data.')}
      onRetry={() => void guildChannelsRefetch()}
    >
      {(() => {
        const allChannels = guildChannels()
        const selectableChannels = getSelectableChannels(allChannels)
        const noCategoryChannels = getNoCategoryChannels(selectableChannels)
        const categories = getUniqueCategories(allChannels).filter(
          (category) => getChannelsByCategory(selectableChannels, category.id).length > 0,
        )

        return (
          <select
            class="select w-full"
            aria-label={t('tools.select_channel', 'Select a Channel')}
            disabled={props.disabled}
            value={props.idSelect || '0'}
            onChange={(event) => props.callback?.(event.currentTarget.value)}
          >
            <option value="0">{t('tools.select_channel', 'Select a Channel')}</option>
            <Show when={noCategoryChannels.length > 0}>
              <optgroup label={t('ui.no_category', 'No Category')}>
                <For each={noCategoryChannels}>
                  {(channel) => (
                    <option value={channel.id} selected={props.idSelect === channel.id}>
                      {channel.name}
                    </option>
                  )}
                </For>
              </optgroup>
            </Show>
            <For each={categories}>
              {(category) => (
                <optgroup label={category.name}>
                  <For each={getChannelsByCategory(selectableChannels, category.id)}>
                    {(channel) => (
                      <option value={channel.id} selected={props.idSelect === channel.id}>
                        {channel.name}
                      </option>
                    )}
                  </For>
                </optgroup>
              )}
            </For>
          </select>
        )
      })()}
    </AsyncState>
  )
}

interface AdminChannelSelectorProps {
  title?: string
  id: string
  onlyTextChannel?: boolean
  idSelect?: string
  callback?: (channelID: string) => unknown | Promise<unknown>
}

const AdminChannelSelector: Component<AdminChannelSelectorProps> = (props) => {
  const { t } = useI18n()
  const onlyTextChannel = props.onlyTextChannel ?? true
  const [selected, setSelected] = createSignal(props.idSelect || '0')
  const save = createAsyncAction({ errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.') })

  createEffect(() => setSelected(props.idSelect || '0'))

  function discard() {
    setSelected(props.idSelect || '0')
    save.reset()
  }

  async function confirm() {
    if (selected() === '0' || guildChannels.loading || guildChannels.error) return
    if (await save.run(async () => props.callback?.(selected()))) closeDialog(props.id)
  }

  return (
    <>
      <AdminModal
        title={props.title || t('tools.select_channel', 'Select a Channel')}
        id={props.id}
        busy={save.pending()}
        onClose={discard}
        onCancel={discard}
      >
        <div class="fieldset">
          <ChannelSelector
            callback={setSelected}
            idSelect={selected()}
            disabled={save.pending()}
            onlyTextChannel={onlyTextChannel}
          />
        </div>
        <FormActions
          pending={save.pending()}
          disabled={selected() === '0' || guildChannels.loading || !!guildChannels.error}
          error={save.error()}
          onSave={() => void confirm()}
          onCancel={() => closeDialog(props.id)}
        />
      </AdminModal>
    </>
  )
}

export default AdminChannelSelector
