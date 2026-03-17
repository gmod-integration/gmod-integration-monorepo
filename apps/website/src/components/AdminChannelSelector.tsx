import { Component, For, ParentProps, Show } from 'solid-js'
import AdminModal from './AdminModal'
import { guildChannels } from '../pages/dashboard/guilds/GuildInformations'
import { useI18n } from '../i18n'
import { TypeDiscordChannel } from '../utils/types/DiscordTypes'

interface ChannelSelectorProps extends ParentProps {
  callback?: (channelID: string) => void
  hasModal?: boolean
  idSelect?: string
}

export const ChannelSelector: Component<ChannelSelectorProps> = (props) => {
  const { t } = useI18n()
  props.hasModal = props.hasModal || false

  function getUniqueCategories(channels: TypeDiscordChannel[]) {
    return channels
      .sort((a, b) => a.position - b.position)
      .filter((channel) => channel.type === 4)
      .map((channel) => ({ id: channel.id, name: channel.name }))
  }

  function getChannelsByCategory(categoryID: string) {
    return guildChannels()
      .filter((channel) => channel.parentID === categoryID)
      .sort((a, b) => a.position - b.position)
  }

  function getNoCategoryChannels(channels: TypeDiscordChannel[]) {
    return channels.filter((channel) => channel.type !== 4 && !channel.parentID).sort((a, b) => a.position - b.position)
  }

  return (
    <Show when={!guildChannels.loading} fallback={<div>Loading...</div>}>
      <select
        class="select"
        onChange={async (e) => {
          if (props.hasModal) {
            // @ts-ignore
            select_channel_modal.close()
          }
          props.callback && props.callback(e.currentTarget.value)
        }}
      >
        <option value="0">{t('tools.select_channel', 'Select a Channel')}</option>
        <Show when={getNoCategoryChannels(guildChannels()).length > 0}>
          <optgroup label="No Category">
            <For each={getNoCategoryChannels(guildChannels())}>
              {(channel) => (
                <option value={channel.id} selected={props.idSelect === channel.id}>
                  {channel.name}
                </option>
              )}
            </For>
          </optgroup>
        </Show>
        <For each={getUniqueCategories(guildChannels())}>
          {(category) => (
            <optgroup label={category.name}>
              <For each={getChannelsByCategory(category.id)}>
                {(channel) => <option value={channel.id}>{channel.name}</option>}
              </For>
            </optgroup>
          )}
        </For>
      </select>
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
  props.onlyTextChannel = props.onlyTextChannel || true
  const { t } = useI18n()

  if (props.onlyTextChannel) {
    guildChannels((prevChannels) => prevChannels.filter((channel) => channel.type !== 4))
  }

  return (
    <>
      <AdminModal title={props.title || t('tools.select_channel', 'Select a Channel')} id={props.id}>
        <div class="fieldset">
          <ChannelSelector callback={props.callback || (() => {})} hasModal={true} />
        </div>
      </AdminModal>
    </>
  )
}

export default AdminChannelSelector
