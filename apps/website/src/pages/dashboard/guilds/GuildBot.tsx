import {
  CustomBotInfoSchema,
  CustomBotAvatarSchema,
  CUSTOM_BOT_AVATAR_MAX_BYTES,
  type CustomBotInfo,
} from '@gmod/schema/server/CustomBotProfileSchema.js'
import { useFeatureAccess } from '../../../components/AccessProvider.js'
import { FeatureGate, SuspendedFeature } from '../../../components/FeatureGate.js'
import { closeDialog, showDialog } from '../../../utils/dialog.js'
import { type Component, createResource, createSignal, onCleanup, Show } from 'solid-js'
import AdminPanel from '../../../components/AdminPanel.js'
import AdminModal from '../../../components/AdminModal.js'
import {
  AsyncState,
  Button,
  FormActions,
  FormField,
  Icon,
  SettingRow,
  StatusBadge,
} from '../../../components/ui/index.js'
import { createAsyncAction } from '../../../hooks/createAsyncAction.js'
import { useDraftGuard } from '../../../hooks/draftRegistry.js'
import { A } from '@solidjs/router'
import { useI18n } from '../../../i18n.js'
import { fetchAPI, getUrlWithActualParams } from '../../../utils/api.js'

type Bot = CustomBotInfo
type BotDraft = { username: string; avatar: string; status: string }
const BOT_URL = '/users/:discordID/guilds/:guildID/bot'
const emptyDraft = (): BotDraft => ({ username: '', avatar: '', status: 'disabled' })

const GuildBot: Component = () => {
  const { t } = useI18n()
  const customAccess = useFeatureAccess('bot.custom')
  const presenceAccess = useFeatureAccess('bot.presence')
  const [bot, { mutate: setBot, refetch: refreshBot }] = createResource(async (): Promise<Bot> => {
    const response = await fetchAPI(BOT_URL, 'GET')
    if (!response.ok) throw new Error('Bot request failed')
    return CustomBotInfoSchema.parse(await response.json())
  })
  const [draft, setDraft] = createSignal<BotDraft>(emptyDraft())
  const [originalDraft, setOriginalDraft] = createSignal<BotDraft>(emptyDraft())
  const [token, setToken] = createSignal('')
  const [avatarError, setAvatarError] = createSignal('')
  const [avatarReading, setAvatarReading] = createSignal(false)
  let avatarReader: FileReader | undefined
  let avatarInput!: HTMLInputElement
  const cancelAvatarRead = () => {
    const pending = avatarReader
    avatarReader = undefined
    pending?.abort()
    setAvatarReading(false)
  }
  onCleanup(cancelAvatarRead)
  const [popupError, setPopupError] = createSignal(false)
  const editAction = createAsyncAction({ errorMessage: () => t('ui.save_error', 'Unable to save changes. Try again.') })
  const setupAction = createAsyncAction({
    errorMessage: () => t('ui.save_error', 'Unable to save changes. Try again.'),
  })
  const busy = () => editAction.pending() || setupAction.pending()
  const dirty = () =>
    draft().username !== originalDraft().username ||
    draft().avatar !== originalDraft().avatar ||
    draft().status !== originalDraft().status
  const avatarValid = () =>
    !avatarError() && (!draft().avatar || CustomBotAvatarSchema.safeParse(draft().avatar).success)
  const nameValid = () => draft().username.trim().length >= 2 && draft().username.trim().length <= 32
  const valid = () =>
    nameValid() &&
    !avatarReading() &&
    avatarValid() &&
    ['disabled', 'guildMemberCount', 'playerCount', 'rotate'].includes(draft().status)
  let popupTimer: ReturnType<typeof setInterval> | undefined
  onCleanup(() => clearInterval(popupTimer))

  const updateDraft = (next: Partial<BotDraft>) => {
    if (editAction.pending()) return
    editAction.reset()
    setDraft((previous) => ({ ...previous, ...next }))
  }
  const discardEdit = () => {
    if (editAction.pending()) return
    cancelAvatarRead()
    setAvatarError('')
    if (avatarInput) avatarInput.value = ''
    setDraft({ ...originalDraft() })
    editAction.reset()
  }
  const discardSetup = () => {
    if (setupAction.pending()) return
    setToken('')
    setupAction.reset()
  }
  useDraftGuard({ dirty, pending: editAction.pending, discard: discardEdit })
  useDraftGuard({ dirty: () => !!token(), pending: setupAction.pending, discard: discardSetup })
  const openEditor = () => {
    if (bot.loading || bot.error || busy() || !customAccess.allowed()) return
    const current = bot()!
    cancelAvatarRead()
    setAvatarError('')
    if (avatarInput) avatarInput.value = ''
    const next = { username: current.username, avatar: '', status: current.status }
    setOriginalDraft(next)
    setDraft({ ...next })
    editAction.reset()
    showDialog('edit_bot')
  }
  const openSetup = () => {
    if (bot.loading || bot.error || busy() || !customAccess.allowed()) return
    discardSetup()
    showDialog('setup_bot')
  }

  async function saveBot() {
    if (
      bot.loading ||
      bot.error ||
      !dirty() ||
      !valid() ||
      !customAccess.allowed() ||
      (!presenceAccess.allowed() && draft().status !== 'disabled' && draft().status !== originalDraft().status)
    )
      return
    const submitted = { ...draft() }
    const saved = await editAction.run(async () => {
      const response = await fetchAPI(BOT_URL, 'PUT', {
        ...(submitted.username.trim() !== originalDraft().username ? { username: submitted.username.trim() } : {}),
        ...(submitted.avatar ? { avatar: submitted.avatar } : {}),
        ...(submitted.status !== originalDraft().status ? { status: submitted.status } : {}),
      })
      if (!response.ok) throw new Error('Bot update failed')
      const updated = CustomBotInfoSchema.parse(await response.json())
      setBot(updated)
      setOriginalDraft({ username: updated.username, avatar: '', status: updated.status })
      setDraft({ username: updated.username, avatar: '', status: updated.status })
    })
    if (saved) closeDialog('edit_bot')
  }

  async function setupBot() {
    if (bot.loading || bot.error || !token().trim() || !customAccess.allowed()) return
    const submittedToken = token()
    const saved = await setupAction.run(async () => {
      const response = await fetchAPI(BOT_URL, 'PATCH', { token: submittedToken })
      if (!response.ok) throw new Error('Bot setup failed')
      setBot(CustomBotInfoSchema.parse(await response.json()))
      setToken('')
    })
    if (saved) closeDialog('setup_bot')
  }

  function selectAvatar(file: File | undefined) {
    cancelAvatarRead()
    if (!file) return
    setAvatarError('')
    if (
      !['image/png', 'image/jpeg'].includes(file.type) ||
      file.size === 0 ||
      file.size > CUSTOM_BOT_AVATAR_MAX_BYTES
    ) {
      setAvatarError(t('dashboard.guild.bot.avatar_upload_error', 'Choose a PNG or JPEG image up to 2 MiB.'))
      return
    }
    const reader = new FileReader()
    avatarReader = reader
    setAvatarReading(true)
    reader.onload = () => {
      if (avatarReader !== reader) return
      avatarReader = undefined
      setAvatarReading(false)
      const parsed = CustomBotAvatarSchema.safeParse(reader.result)
      if (!parsed.success) {
        setAvatarError(t('dashboard.guild.bot.avatar_upload_error', 'Choose a PNG or JPEG image up to 2 MiB.'))
        return
      }
      updateDraft({ avatar: parsed.data })
    }
    reader.onerror = () => {
      if (avatarReader !== reader) return
      avatarReader = undefined
      setAvatarReading(false)
      setAvatarError(t('dashboard.guild.bot.avatar_read_error', 'Unable to read this image. Choose it again.'))
    }
    reader.readAsDataURL(file)
  }

  function getNameOf(id: string) {
    const names: Record<string, string> = {
      disabled: t('dashboard.guild.bot.disabled', 'No activity'),
      guildMemberCount: t('dashboard.guild.bot.guildMemberCount', 'Show Discord member count'),
      playerCount: t('dashboard.guild.bot.playerCount', 'Show Player Count'),
      rotate: t('dashboard.guild.bot.rotate', 'Alternate member and player counts'),
    }
    return names[id] || t('dashboard.guild.bot.unknown', 'Unknown')
  }

  function inviteBot() {
    if (bot.loading || bot.error) return
    setPopupError(false)
    const inviteWindow = window.open(
      getUrlWithActualParams(
        `https://discord.com/oauth2/authorize?client_id=${bot()!.id}&permissions=8&scope=bot&guild_id=:guildID`,
      ),
      '_blank',
      'width=600,height=900',
    )
    if (!inviteWindow) {
      setPopupError(true)
      return
    }
    clearInterval(popupTimer)
    popupTimer = setInterval(() => {
      if (inviteWindow.closed) {
        clearInterval(popupTimer)
        void refreshBot()
      }
    }, 500)
  }

  return (
    <>
      <Show when={!bot.loading && !bot.error && !bot()!.custom && !customAccess.allowed() && !bot()!.purchased}>
        <div class="text-indigo-300 flex items-center rounded-lg border-indigo-400 border p-4 gap-4">
          <Icon name="bot" aria-hidden="true" />
          <span>
            {t(
              'dashboard.guild.bot.feature_unavailable',
              'This feature is reserved for custom bots purchased on GmodStore. A standard Premium subscription does not include custom bots.',
            )}{' '}
            <A class="link" href="/gmodstore">
              {t('dashboard.guild.bot.get_custom_bot', 'Get a Custom Bot')}
            </A>
          </span>
        </div>
      </Show>

      <AdminModal
        title={t('dashboard.guild.bot.edit_custom_bot', 'Edit Custom Bot')}
        id="edit_bot"
        busy={editAction.pending()}
        onClose={discardEdit}
        onCancel={discardEdit}
      >
        <FormField
          id="bot-name"
          label={t('dashboard.guild.bot.name', 'Name')}
          description={t(
            'dashboard.guild.bot.name_hint',
            'The bot name displayed in Discord. Save this dialog to apply your changes.',
          )}
          required
          error={
            dirty() && !nameValid()
              ? t('dashboard.guild.bot.name_invalid', 'Use a bot name of 2 to 32 characters.')
              : undefined
          }
        >
          <input
            id="bot-name"
            type="text"
            minLength={2}
            maxLength={32}
            class="input w-full"
            disabled={bot.loading || editAction.pending()}
            value={draft().username}
            aria-invalid={dirty() && !nameValid()}
            aria-describedby={`bot-name-description${dirty() && !nameValid() ? ' bot-name-error' : ''}`}
            onInput={(event) => updateDraft({ username: event.currentTarget.value })}
          />
        </FormField>
        <FormField
          id="bot-avatar"
          label={t('dashboard.guild.bot.avatar', 'Avatar')}
          description={t(
            'dashboard.guild.bot.avatar_hint',
            'Choose a PNG or JPEG image up to 2 MiB. Save to replace the current avatar; leaving this empty keeps it unchanged.',
          )}
          error={avatarError() || undefined}
        >
          <input
            id="bot-avatar"
            ref={avatarInput}
            type="file"
            accept="image/png,image/jpeg"
            class="file-input w-full"
            disabled={bot.loading || editAction.pending()}
            aria-invalid={!!avatarError()}
            aria-describedby={`bot-avatar-description${avatarError() ? ' bot-avatar-error' : ''}`}
            onChange={(event) => selectAvatar(event.currentTarget.files?.[0])}
          />
          <Show when={avatarReading()}>
            <p role="status" class="text-sm text-base-content/65">
              {t('dashboard.guild.bot.avatar_reading', 'Reading image…')}
            </p>
          </Show>
          <Show when={draft().avatar}>
            <div class="flex items-center gap-3 pt-3">
              <img
                src={draft().avatar}
                alt={t('dashboard.guild.bot.avatar_preview', 'New avatar preview')}
                class="h-16 w-16 rounded-full object-cover"
              />
              <Button
                size="sm"
                disabled={editAction.pending()}
                onClick={() => {
                  updateDraft({ avatar: '' })
                  setAvatarError('')
                }}
              >
                {t('dashboard.guild.bot.avatar_keep', 'Keep current avatar')}
              </Button>
            </div>
          </Show>
        </FormField>
        <FormField
          id="bot-status"
          label={t('dashboard.guild.bot.status', 'Discord activity')}
          description={t(
            'dashboard.guild.bot.refresh_every_30s',
            'The activity shown under the bot name in Discord, refreshed every 30 seconds. Player counts combine the linked game servers. No activity hides this text without disconnecting the bot.',
          )}
        >
          <select
            id="bot-status"
            aria-describedby="bot-status-description"
            class="select w-full"
            disabled={bot.loading || editAction.pending()}
            value={draft().status}
            onChange={(event) => updateDraft({ status: event.currentTarget.value })}
          >
            <option value="disabled">{getNameOf('disabled')}</option>
            <option value="guildMemberCount" disabled={!presenceAccess.allowed()}>
              {getNameOf('guildMemberCount')}
            </option>
            <option value="playerCount" disabled={!presenceAccess.allowed()}>
              {getNameOf('playerCount')}
            </option>
            <option value="rotate" disabled={!presenceAccess.allowed()}>
              {getNameOf('rotate')}
            </option>
          </select>
        </FormField>
        <FeatureGate capability="bot.presence" showQuota={false} />
        <SuspendedFeature capability="bot.presence" active={originalDraft().status !== 'disabled'} />
        <FormActions
          dirty={dirty()}
          pending={editAction.pending()}
          disabled={
            bot.loading ||
            !!bot.error ||
            !valid() ||
            !customAccess.allowed() ||
            (!presenceAccess.allowed() && draft().status !== 'disabled' && draft().status !== originalDraft().status)
          }
          onSave={saveBot}
          onCancel={() => {
            discardEdit()
            closeDialog('edit_bot')
          }}
          error={editAction.error()}
        />
      </AdminModal>

      <AdminModal
        title={t('dashboard.guild.bot.setup_custom_bot', 'Setup Custom Bot')}
        id="setup_bot"
        busy={setupAction.pending()}
        onClose={discardSetup}
        onCancel={discardSetup}
      >
        <div class="rounded-lg border border-base-200 p-3">
          <h3 class="font-semibold">{t('dashboard.guild.bot.how_to_setup', 'How to setup a custom bot:')}</h3>
          <ol class="mt-2 list-decimal text-sm text-base-content/70 list-inside space-y-1">
            <li>
              {t('dashboard.guild.bot.create_app', 'Create an application in the Discord Developer Portal:')}{' '}
              <A class="link" href="https://discord.com/developers/applications">
                discord.dev
              </A>
            </li>
            <li>{t('dashboard.guild.bot.go_to_bot_tab', 'Open the Bot tab for that application.')}</li>
            <li>{t('dashboard.guild.bot.enable_x', "Enable 'Presence Intent'", 'Presence Intent')}</li>
            <li>{t('dashboard.guild.bot.enable_x', "Enable 'Server Members Intent'", 'Server Members Intent')}</li>
            <li>{t('dashboard.guild.bot.enable_x', "Enable 'Message Content Intent'", 'Message Content Intent')}</li>
            <li>
              {t(
                'dashboard.guild.bot.reset_token',
                'Use Reset Token to generate a token. This invalidates any previous token for this bot.',
              )}
            </li>
            <li>
              {t(
                'dashboard.guild.bot.copy_token',
                'Copy the token, paste it below and save. You can then invite the custom bot to this Discord server.',
              )}
            </li>
          </ol>
        </div>
        <FormField
          id="bot-token"
          label={t('dashboard.guild.bot.token', 'Bot token')}
          description={t(
            'dashboard.guild.bot.token_hint',
            'This secret authorizes Gmod Integration to run your custom bot. Paste the bot token from the Developer Portal, not a user token or application secret. Keep it private.',
          )}
          required
        >
          <input
            id="bot-token"
            maxLength={256}
            aria-describedby="bot-token-description"
            type="password"
            autocomplete="new-password"
            class="input w-full"
            disabled={bot.loading || setupAction.pending()}
            value={token()}
            onInput={(event) => setToken(event.currentTarget.value)}
          />
        </FormField>
        <FeatureGate capability="bot.custom" loading={bot.loading} error={bot.error} showQuota={false} />
        <FormActions
          dirty={!!token().trim()}
          pending={setupAction.pending()}
          disabled={bot.loading || !!bot.error || !customAccess.allowed()}
          onSave={setupBot}
          onCancel={() => {
            discardSetup()
            closeDialog('setup_bot')
          }}
          error={setupAction.error()}
        />
      </AdminModal>

      <p class="text-sm leading-relaxed text-base-content/60">
        {t(
          'dashboard.guild.bot.edit_bot_info',
          'Configure the identity, displayed activity and connection of your custom Discord bot. Set its token and invite it to this Discord server before editing its identity.',
        )}
      </p>
      <AsyncState
        loading={bot.loading}
        loadingLabel={t('dashboard.guild.bot.loading', 'Loading...')}
        error={!!bot.error}
        onRetry={() => void refreshBot()}
      >
        <Show when={!bot.loading && !bot.error}>
          <div class="settings-card-grid">
            <AdminPanel
              title={t('settings.bot_identity', 'Identity and presence')}
              icon="user-round"
              footer={
                <FeatureGate capability="bot.custom" loading={bot.loading} error={bot.error} showQuota={false}>
                  <Button
                    variant="primary"
                    disabled={
                      busy() ||
                      !customAccess.allowed() ||
                      bot.loading ||
                      !!bot.error ||
                      !bot()?.custom ||
                      !bot()?.onGuild
                    }
                    onClick={openEditor}
                  >
                    {t('dashboard.guild.bot.edit_custom_bot', 'Edit Custom Bot')}
                  </Button>
                </FeatureGate>
              }
            >
              <dl class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 min-w-0">
                <dt class="text-base-content/70">{t('dashboard.guild.bot.name', 'Name')}</dt>
                <dd class="break-words">{bot()!.username}</dd>
                <dt class="text-base-content/70">{t('dashboard.guild.bot.avatar', 'Avatar')}</dt>
                <dd>
                  <img
                    src={bot()!.avatar || undefined}
                    alt={t('dashboard.guild.bot.avatar', 'Avatar')}
                    class="w-8 h-8 rounded-full"
                  />
                </dd>
                <dt class="text-base-content/70">{t('dashboard.guild.bot.status', 'Discord activity')}</dt>
                <dd>
                  <StatusBadge
                    tone={
                      bot()!.status === 'disabled'
                        ? 'neutral'
                        : ['guildMemberCount', 'playerCount', 'rotate'].includes(bot()!.status)
                          ? 'info'
                          : 'warning'
                    }
                    icon={
                      bot()!.status === 'disabled'
                        ? 'x'
                        : ['guildMemberCount', 'playerCount', 'rotate'].includes(bot()!.status)
                          ? 'activity'
                          : 'info'
                    }
                  >
                    {getNameOf(bot()!.status)}
                  </StatusBadge>
                </dd>
              </dl>
            </AdminPanel>
            <Show when={customAccess.allowed() || bot()!.purchased}>
              <AdminPanel title={t('settings.bot_connection', 'Connection and credentials')} icon="link">
                <SettingRow
                  title={t('settings.bot_membership', 'Discord server')}
                  description={
                    bot()!.onGuild
                      ? t('settings.bot_connected', 'The bot is already in this Discord server.')
                      : t('settings.bot_invite_hint', 'Invite the custom bot before editing its identity.')
                  }
                >
                  <StatusBadge tone={bot()!.onGuild ? 'success' : 'warning'} icon={bot()!.onGuild ? 'check' : 'x'}>
                    {bot()!.onGuild
                      ? t('settings.bot_member', 'In this server')
                      : t('settings.bot_not_member', 'Not in this server')}
                  </StatusBadge>
                  <Button
                    disabled={busy()}
                    onClick={inviteBot}
                    classList={{ hidden: bot()!.onGuild || !bot()!.custom }}
                  >
                    {t('dashboard.guild.bot.join_guild', 'Invite to this Discord server')}
                  </Button>
                </SettingRow>
                <SettingRow
                  title={t('dashboard.guild.bot.token', 'Bot token')}
                  description={t(
                    'settings.bot_token_hint',
                    'Use setup to configure or replace the custom bot token. Saved tokens are never shown.',
                  )}
                >
                  <StatusBadge tone={bot()!.tokenConfigured ? 'success' : 'neutral'}>
                    {bot()!.tokenConfigured
                      ? t('dashboard.guild.bot.token_configured', 'Token configured')
                      : t('dashboard.guild.bot.token_missing', 'Token not configured')}
                  </StatusBadge>

                  <Button
                    disabled={busy() || !customAccess.allowed()}
                    onClick={openSetup}
                    classList={{ hidden: !bot()!.active }}
                  >
                    {t('dashboard.guild.bot.setup_custom_bot', 'Setup Custom Bot')}
                  </Button>
                </SettingRow>
                <Show when={popupError()}>
                  <p role="alert" class="text-error">
                    {t('ui.popup_blocked', 'Allow pop-ups for this site to invite the bot.')}
                  </p>
                </Show>
              </AdminPanel>
            </Show>
          </div>
        </Show>
      </AsyncState>
    </>
  )
}

export default GuildBot
