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
  SettingGroup,
  SettingRow,
} from '../../../components/ui/index.js'
import { createAsyncAction } from '../../../hooks/createAsyncAction.js'
import { useDraftGuard } from '../../../hooks/draftRegistry.js'
import { A } from '@solidjs/router'
import { useI18n } from '../../../i18n.js'
import { fetchAPI, getUrlWithActualParams } from '../../../utils/api.js'

type Bot = {
  id: string
  username: string
  avatar: string
  status: string
  custom: boolean
  purchased: boolean
  onGuild: boolean
  active: boolean
  token?: string
}
type BotDraft = Pick<Bot, 'username' | 'avatar' | 'status'>
const BOT_URL = '/users/:discordID/guilds/:guildID/bot'
const emptyDraft = (): BotDraft => ({ username: '', avatar: '', status: 'disabled' })

const GuildBot: Component = () => {
  const { t } = useI18n()
  const [bot, { mutate: setBot, refetch: refreshBot }] = createResource(async (): Promise<Bot> => {
    const response = await fetchAPI(BOT_URL, 'GET')
    if (!response.ok) throw new Error('Bot request failed')
    return await response.json()
  })
  const [draft, setDraft] = createSignal<BotDraft>(emptyDraft())
  const [originalDraft, setOriginalDraft] = createSignal<BotDraft>(emptyDraft())
  const [token, setToken] = createSignal('')
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
  const avatarValid = () => {
    if (!draft().avatar.trim()) return true
    try {
      return ['http:', 'https:'].includes(new URL(draft().avatar).protocol)
    } catch {
      return false
    }
  }
  const valid = () =>
    !!draft().username.trim() &&
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
    if (bot.loading || bot.error || busy()) return
    const current = bot()!
    const next = { username: current.username, avatar: current.avatar, status: current.status }
    setOriginalDraft(next)
    setDraft({ ...next })
    editAction.reset()
    showDialog('edit_bot')
  }
  const openSetup = () => {
    if (bot.loading || bot.error || busy()) return
    discardSetup()
    showDialog('setup_bot')
  }

  async function saveBot() {
    if (bot.loading || bot.error || !dirty() || !valid()) return
    const submitted = { ...draft() }
    const saved = await editAction.run(async () => {
      const response = await fetchAPI(BOT_URL, 'PUT', { ...bot()!, ...submitted })
      if (!response.ok) throw new Error('Bot update failed')
      const updated: Bot = await response.json()
      setBot(updated)
      setOriginalDraft({ username: updated.username, avatar: updated.avatar, status: updated.status })
      setDraft({ username: updated.username, avatar: updated.avatar, status: updated.status })
    })
    if (saved) closeDialog('edit_bot')
  }

  async function setupBot() {
    if (bot.loading || bot.error || !token().trim()) return
    const submittedToken = token()
    const saved = await setupAction.run(async () => {
      const response = await fetchAPI(BOT_URL, 'PATCH', { token: submittedToken })
      if (!response.ok) throw new Error('Bot setup failed')
      setBot(await response.json())
      setToken('')
    })
    if (saved) closeDialog('setup_bot')
  }

  function getNameOf(id: string) {
    const names: Record<string, string> = {
      disabled: t('dashboard.guild.bot.disabled', 'Disabled'),
      guildMemberCount: t('dashboard.guild.bot.guildMemberCount', 'Show Guild Member Count'),
      playerCount: t('dashboard.guild.bot.playerCount', 'Show Player Count'),
      rotate: t('dashboard.guild.bot.rotate', 'Alternate Showed Information'),
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
      <Show when={!bot.loading && !bot.error && !bot()!.custom}>
        <div class="text-indigo-300 flex items-center rounded-lg border-indigo-400 border p-4 gap-4">
          <Icon name="bot" aria-hidden="true" />
          <span>
            {t(
              'dashboard.guild.bot.feature_unavailable',
              "This feature is only available for GmodStore's custom bots.",
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
          required
          error={dirty() && !draft().username.trim() ? t('ui.invalid_value', 'Enter a valid value.') : undefined}
        >
          <input
            id="bot-name"
            type="text"
            class="input w-full"
            disabled={bot.loading || editAction.pending()}
            value={draft().username}
            aria-invalid={dirty() && !draft().username.trim()}
            aria-describedby={dirty() && !draft().username.trim() ? 'bot-name-error' : undefined}
            onInput={(event) => updateDraft({ username: event.currentTarget.value })}
          />
        </FormField>
        <FormField
          id="bot-avatar"
          label={t('dashboard.guild.bot.avatar', 'Avatar')}
          error={!avatarValid() ? t('ui.invalid_value', 'Enter a valid value.') : undefined}
        >
          <input
            id="bot-avatar"
            type="url"
            class="input w-full"
            disabled={bot.loading || editAction.pending()}
            value={draft().avatar}
            aria-invalid={!avatarValid()}
            aria-describedby={!avatarValid() ? 'bot-avatar-error' : undefined}
            onInput={(event) => updateDraft({ avatar: event.currentTarget.value })}
          />
        </FormField>
        <FormField
          id="bot-status"
          label={t('dashboard.guild.bot.status', 'Status')}
          description={t('dashboard.guild.bot.refresh_every_30s', 'Refresh every 30s')}
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
            <option value="guildMemberCount">{getNameOf('guildMemberCount')}</option>
            <option value="playerCount">{getNameOf('playerCount')}</option>
            <option value="rotate">{getNameOf('rotate')}</option>
          </select>
        </FormField>
        <FormActions
          dirty={dirty()}
          pending={editAction.pending()}
          disabled={bot.loading || !!bot.error || !valid()}
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
              {t('dashboard.guild.bot.create_app', 'Create a app on')}{' '}
              <A class="link" href="https://discord.com/developers/applications">
                discord.dev
              </A>
            </li>
            <li>{t('dashboard.guild.bot.go_to_bot_tab', 'Go to the bot tab')}</li>
            <li>{t('dashboard.guild.bot.enable_x', "Enable 'Presence Intent'", 'Presence Intent')}</li>
            <li>{t('dashboard.guild.bot.enable_x', "Enable 'Server Members Intent'", 'Server Members Intent')}</li>
            <li>{t('dashboard.guild.bot.enable_x', "Enable 'Message Content Intent'", 'Message Content Intent')}</li>
            <li>{t('dashboard.guild.bot.reset_token', 'Reset the token')}</li>
            <li>{t('dashboard.guild.bot.copy_token', 'Copy the token')}</li>
          </ol>
        </div>
        <FormField id="bot-token" label={t('dashboard.guild.bot.token', 'Token')} required>
          <input
            id="bot-token"
            type="password"
            autocomplete="new-password"
            class="input w-full"
            disabled={bot.loading || setupAction.pending()}
            value={token()}
            onInput={(event) => setToken(event.currentTarget.value)}
          />
        </FormField>
        <FormActions
          dirty={!!token().trim()}
          pending={setupAction.pending()}
          disabled={bot.loading || !!bot.error}
          onSave={setupBot}
          onCancel={() => {
            discardSetup()
            closeDialog('setup_bot')
          }}
          error={setupAction.error()}
        />
      </AdminModal>

      <AdminPanel
        title={t('dashboard.guild.bot.custom_bot', 'Custom Bot')}
        description={t('dashboard.guild.bot.edit_bot_info', 'Edit the bot information.')}
        icon="bot"
        type="none"
        actions={
          <Show when={!bot.loading && !bot.error && bot()!.purchased}>
            <Button
              variant="primary"
              disabled={busy()}
              onClick={openEditor}
              classList={{ hidden: !bot()!.custom || !bot()!.onGuild }}
            >
              {t('dashboard.guild.bot.edit_custom_bot', 'Edit Custom Bot')}
            </Button>
          </Show>
        }
      >
        <AsyncState
          loading={bot.loading}
          loadingLabel={t('dashboard.guild.bot.loading', 'Loading...')}
          error={!!bot.error}
          onRetry={() => void refreshBot()}
        >
          <Show when={!bot.loading && !bot.error}>
            <SettingGroup title={t('settings.bot_identity', 'Identity and presence')} icon="user-round">
              <dl class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 min-w-0 p-5">
                <dt class="text-base-content/70">{t('dashboard.guild.bot.name', 'Name')}</dt>
                <dd class="break-words">{bot()!.username}</dd>
                <dt class="text-base-content/70">{t('dashboard.guild.bot.avatar', 'Avatar')}</dt>
                <dd>
                  <img
                    src={bot()!.avatar}
                    alt={t('dashboard.guild.bot.avatar', 'Avatar')}
                    class="w-8 h-8 rounded-full"
                  />
                </dd>
                <dt class="text-base-content/70">{t('dashboard.guild.bot.status', 'Status')}</dt>
                <dd>{getNameOf(bot()!.status)}</dd>
              </dl>
            </SettingGroup>
            <Show when={bot()!.purchased}>
              <SettingGroup title={t('settings.bot_connection', 'Connection and credentials')} icon="link">
                <SettingRow
                  title={t('settings.bot_membership', 'Discord server')}
                  description={
                    bot()!.onGuild
                      ? t('settings.bot_connected', 'The bot is already in this Discord server.')
                      : t('settings.bot_invite_hint', 'Invite the custom bot before editing its identity.')
                  }
                >
                  <Button
                    disabled={busy()}
                    onClick={inviteBot}
                    classList={{ hidden: bot()!.onGuild || !bot()!.custom }}
                  >
                    {t('dashboard.guild.bot.join_guild', 'Join Guild')}
                  </Button>
                </SettingRow>
                <SettingRow
                  title={t('dashboard.guild.bot.token', 'Token')}
                  description={t('settings.bot_token_hint', 'Use setup to configure or replace the custom bot token.')}
                >
                  <Button disabled={busy()} onClick={openSetup} classList={{ hidden: !bot()!.active }}>
                    {t('dashboard.guild.bot.setup_custom_bot', 'Setup Custom Bot')}
                  </Button>
                </SettingRow>
              </SettingGroup>
            </Show>
          </Show>
        </AsyncState>
        <Show when={popupError()}>
          <p role="alert" class="text-error">
            {t('ui.popup_blocked', 'Allow pop-ups for this site to invite the bot.')}
          </p>
        </Show>
      </AdminPanel>
    </>
  )
}

export default GuildBot
