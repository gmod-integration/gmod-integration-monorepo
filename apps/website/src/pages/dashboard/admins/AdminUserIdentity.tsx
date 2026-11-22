import { CopyableValue, DiscordAvatar } from '../../../components/ui/index.js'
import DiscordUser from '../../../components/discord/DiscordUser.js'
import { useI18n } from '../../../i18n.js'

export default function AdminUserIdentity(props: {
  user: { id: string; username?: string | null; avatarURL?: string | null }
}) {
  const { t } = useI18n()
  return (
    <div class="flex min-w-0 items-center gap-3">
      <span class="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-base-200">
        <DiscordAvatar user={{ id: props.user.id, avatarURL: props.user.avatarURL ?? undefined }} />
      </span>
      <div class="flex min-w-0 flex-col items-start gap-1">
        <DiscordUser user={{ id: props.user.id, name: props.user.username }} />
        <CopyableValue value={props.user.id} label={t('admin_v6.copy_user_id', 'Copy Discord user ID')} />
      </div>
    </div>
  )
}
