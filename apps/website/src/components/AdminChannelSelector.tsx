import { Component, For, ParentProps, Show } from 'solid-js'
import AdminModal from './AdminModal'
import { guildChannels } from '../pages/dashboard/guilds/GuildInformations'
import { useI18n } from '../i18n'
import { TypeDiscordChannel } from '../utils/types/DiscordTypes'

interface ChannelSelectorProps extends ParentProps {
  callback?: (channelID: string) => void
  hasModal?: boolean
  idSelect?: string
  onlyTextChannel?: boolean
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
  const hasModal = props.hasModal ?? false
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
    <Show when={!guildChannels.loading} fallback={<div>Loading...</div>}>
      {(() => {
        const allChannels = guildChannels()
        const selectableChannels = getSelectableChannels(allChannels)
        const noCategoryChannels = getNoCategoryChannels(selectableChannels)
        const categories = getUniqueCategories(allChannels).filter(
          (category) => getChannelsByCategory(selectableChannels, category.id).length > 0,
        )

        return (
          <select
            class="select"
            onChange={async (e) => {
              if (hasModal) {
                // @ts-ignore
                select_channel_modal.close()
              }
              props.callback && props.callback(e.currentTarget.value)
            }}
          >
            <option value="0">{t('tools.select_channel', 'Select a Channel')}</option>
            <Show when={noCategoryChannels.length > 0}>
              <optgroup label="No Category">
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
    </Show>
  )
}

interface AdminChannelSelectorProps {
  title?: string
  id: string
  onlyTextChannel?: boolean
  callback?: any
}

const AdminChannelSelector: Component<AdminChannelSelectorProps> = (props) => {
  const { t } = useI18n()
  const onlyTextChannel = props.onlyTextChannel ?? true

  return (
    <>
      <AdminModal title={props.title || t('tools.select_channel', 'Select a Channel')} id={props.id}>
        <div class="fieldset">
          <ChannelSelector callback={props.callback || (() => {})} hasModal={true} onlyTextChannel={onlyTextChannel} />
        </div>
      </AdminModal>
    </>
  )
}

export default AdminChannelSelector
