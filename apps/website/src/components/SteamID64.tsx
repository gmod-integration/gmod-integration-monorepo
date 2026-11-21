import type { Component, ParentProps } from 'solid-js'
import { CopyableValue } from './ui/CopyableValue.js'

interface SteamID64Props extends ParentProps {
  steamID64: string
}

export const SteamID64: Component<SteamID64Props> = (props) => {
  return (
    <CopyableValue
      value={props.steamID64}
      display={
        <a
          href={`https://steamcommunity.com/profiles/${props.steamID64}`}
          target="_blank"
          rel="noopener noreferrer"
          class="text-info-500 hover:underline"
        >
          {props.steamID64}
        </a>
      }
    />
  )
}
