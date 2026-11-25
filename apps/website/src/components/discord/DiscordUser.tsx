export interface DiscordUserProps {
  user: { id: string; name?: string | null }
}

/** Read-only Discord mention. An unresolved name falls back to the exact user ID. */
export default function DiscordUser(props: DiscordUserProps) {
  return (
    <span class="discord-user-mention" title={props.user.id}>
      @{props.user.name?.trim() || props.user.id}
    </span>
  )
}
