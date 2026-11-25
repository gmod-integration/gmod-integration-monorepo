import { Show, type Component } from 'solid-js'
import { hexToHSL } from '../../utils/hexToHSL'
import { guildChannels } from '../../pages/dashboard/guilds/GuildInformations'
import type { TypeDiscordChannel } from '../../utils/types/DiscordTypes'
import { getUrlWithActualParams } from '../../utils/api'

interface DiscordChannelProps {
  channelID?: string
  channel?: TypeDiscordChannel
}

const hsl = hexToHSL('#7d95ff')

const DiscordChannel: Component<DiscordChannelProps> = (props) => {
  const channel = () => {
    if (props.channel) return props.channel
    if (!props.channelID || guildChannels.loading || guildChannels.error) return
    return guildChannels().find((candidate) => candidate.id === props.channelID)
  }

  return (
    <Show when={channel()}>
      {(resolved) => (
        <a
          href={getUrlWithActualParams(`https://discord.com/channels/:guildID/${resolved().id}`)}
          class="w-min text-nowrap rounded-md px-1"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#7d95ff',
            'background-color': `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%, 0.1)`,
          }}
        >
          {`#${resolved().name}`}
        </a>
      )}
    </Show>
  )
}

export default DiscordChannel
