import { Icon } from '../ui/index.js'
import { Show, type Component } from 'solid-js'
import { hexToHSL } from '../../utils/hexToHSL'
import type { TypeDiscordChannel } from '../../utils/types/DiscordTypes'
import { guildChannels } from '../../pages/dashboard/guilds/GuildInformations'
import { getUrlWithActualParams } from '../../utils/api'

interface DiscordMessageProps {
  channelID?: string
  channel?: TypeDiscordChannel
  messageID: string
}

const hsl = hexToHSL('#7d95ff')

const DiscordMessage: Component<DiscordMessageProps> = (props) => {
  const channel = () => {
    if (props.channel) return props.channel
    if (!props.channelID || guildChannels.loading || guildChannels.error) return
    return guildChannels().find((candidate) => candidate.id === props.channelID)
  }

  return (
    <Show when={channel()}>
      {(resolved) => (
        <a
          href={getUrlWithActualParams(`https://discord.com/channels/:guildID/${resolved().id}/${props.messageID}`)}
          class="w-min text-nowrap rounded-md px-1"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#7d95ff',
            'background-color': `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%, 0.1)`,
          }}
        >
          {`#${resolved().name} > `} <Icon name="message-circle" aria-hidden="true" />
        </a>
      )}
    </Show>
  )
}

export default DiscordMessage
