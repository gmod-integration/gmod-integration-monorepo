import { createEffect, createMemo, createSignal, on, Show } from 'solid-js'
import {
  getDiscordAvatarUrl,
  getDiscordDefaultAvatarUrl,
  type DiscordAvatarIdentity,
} from '../../utils/discordAvatar.js'
import { Icon } from './Icon.js'

export interface DiscordAvatarProps {
  user: DiscordAvatarIdentity | undefined
  class?: string
}

/** Decorative identity image. Discord's default image is tried before a final offline icon. */
export function DiscordAvatar(props: DiscordAvatarProps) {
  const identity = createMemo(() => {
    const primary = getDiscordAvatarUrl(props.user)
    const fallback = getDiscordDefaultAvatarUrl(props.user)
    return { primary, fallback, key: JSON.stringify([props.user?.id, primary, fallback]) }
  })
  const [failures, setFailures] = createSignal<{ key: string; urls: string[] }>({ key: '', urls: [] })
  createEffect(
    on(
      () => identity().key,
      (key) => setFailures({ key, urls: [] }),
      { defer: true },
    ),
  )
  const image = createMemo(
    () => {
      const current = identity()
      const failed = failures().key === current.key ? failures().urls : []
      const src = [current.primary, current.fallback].find((url) => url && !failed.includes(url))
      return src ? { key: current.key, src } : undefined
    },
    undefined,
    { equals: (previous, next) => previous?.key === next?.key && previous?.src === next?.src },
  )
  return (
    <span
      class={`inline-flex h-full w-full items-center justify-center overflow-hidden ${props.class ?? ''}`}
      aria-hidden="true"
    >
      <Show when={image()} keyed fallback={<Icon name="user-round" class="h-3/5 w-3/5" />}>
        {(image) => (
          <img
            src={image.src}
            alt=""
            class="h-full w-full object-cover"
            decoding="async"
            onError={() => {
              if (identity().key !== image.key) return
              setFailures((previous) => ({
                key: image.key,
                urls: [...(previous.key === image.key ? previous.urls : []), image.src],
              }))
            }}
          />
        )}
      </Show>
    </span>
  )
}
