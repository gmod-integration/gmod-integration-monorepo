import { createEffect, createSignal, on, onCleanup, Show, type Component } from 'solid-js'
import type { PlayerProfileResponse } from '@gmod/schema/user/PlayerProfileSchema.js'
import { Button, ButtonLink, CopyButton, Icon } from './ui/index.js'
import { createAsyncAction } from '../hooks/createAsyncAction.js'
import { useI18n } from '../i18n.js'
import { WEBSITE_CONFIG } from '../config.js'

const PlayerProfileActions: Component<{ profile: PlayerProfileResponse }> = (props) => {
  const { t } = useI18n()
  // Explicit Steam namespace keeps links stable even when a Discord snowflake has 17 digits.
  const profileUrl = () => new URL(`/players/steam/${props.profile.player.steamID64}`, WEBSITE_CONFIG.websiteUrl).href
  const action = createAsyncAction({
    errorMessage: () => t('player_actions.share_error', 'Unable to share or copy this profile. Please try again.'),
  })
  const [message, setMessage] = createSignal<'shared' | 'copied'>()
  const [attemptedFor, setAttemptedFor] = createSignal<string>()
  let disposed = false
  onCleanup(() => {
    disposed = true
  })
  const currentAttempt = () => attemptedFor() === props.profile.player.steamID64
  createEffect(
    on(
      () => props.profile.player.steamID64,
      () => {
        setMessage(undefined)
        setAttemptedFor(undefined)
        action.reset()
      },
      { defer: true },
    ),
  )

  const share = async () => {
    if (disposed || action.pending()) return
    const target = props.profile.player.steamID64
    const url = profileUrl()
    setAttemptedFor(target)
    setMessage(undefined)
    await action.run(async () => {
      if (navigator.share) {
        try {
          await navigator.share({
            title: t('player_actions.share_title', '{1} — player profile', props.profile.player.name),
            url,
          })
          if (!disposed && currentAttempt()) setMessage('shared')
          return
        } catch (error) {
          // Closing the native share sheet is a cancellation, not a clipboard request.
          if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return
        }
      }
      if (disposed || !currentAttempt()) return
      await navigator.clipboard.writeText(url)
      if (!disposed && currentAttempt()) setMessage('copied')
    })
  }

  return (
    <div class="mt-4 flex min-w-0 flex-col gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void share()} loading={action.pending()}>
          <Icon name="share-2" size={16} />
          {t('player_actions.share', 'Share profile')}
        </Button>
        <CopyButton
          value={profileUrl()}
          label={t('player_actions.copy_link', 'Copy profile link')}
          disabled={action.pending()}
        />
        <ButtonLink href="/discord" size="sm" target="_blank" rel="noopener noreferrer">
          <Icon name="triangle-alert" size={16} />
          {t('player_actions.report', 'Report player')}
        </ButtonLink>
      </div>
      <p class="player-profile-note">
        {t(
          'player_actions.report_help',
          'Reports are handled through Discord support. Copy the profile link and include it in your message.',
        )}
      </p>
      <Show when={currentAttempt() && message()}>
        <p role="status" class="text-sm text-success">
          {message() === 'copied'
            ? t('player_actions.link_copied', 'Profile link copied.')
            : t('player_actions.shared', 'Profile shared.')}
        </p>
      </Show>
      <Show when={currentAttempt() && action.error()}>
        <p role="alert" class="text-sm text-error">
          {action.error()}
        </p>
      </Show>
    </div>
  )
}

export default PlayerProfileActions
