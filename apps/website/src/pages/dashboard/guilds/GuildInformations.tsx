import { useAccess } from '../../../components/AccessProvider.js'
import { AsyncState, Button, Icon } from '../../../components/ui/index.js'
import type { TypeDiscordChannel, TypeDiscordRole } from '../../../utils/types/DiscordTypes.js'
import { type Component, createEffect, createResource, on, onCleanup, Show } from 'solid-js'
import { getGuild } from '../../../utils/utils'
import AdminPanel from '../../../components/AdminPanel'
import { useLocation, useNavigate } from '@solidjs/router'
import { useI18n } from '../../../i18n'
import { Errors } from '../../../components/layout/Errors'
import { fetchAPI } from '../../../utils/api'

async function fetchGuildRoles(): Promise<TypeDiscordRole[]> {
  return await fetchAPI('/users/:discordID/guilds/:guildID/roles', 'GET')
    .then(async (res) => {
      if (!res.ok) throw new Error('An error occurred while fetching the roles.')
      const roles: TypeDiscordRole[] = await res.json()
      return roles
    })
    .then((data) => {
      return data.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    })
}

export const [guildRoles, { mutate: guildRolesMutate, refetch: guildRolesRefetch }] = createResource(
  'guilds-roles',
  fetchGuildRoles,
  { initialValue: [] },
)

async function fetchGuildChannels(): Promise<TypeDiscordChannel[]> {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/channels', 'GET')
  if (!res.ok) {
    throw new Error('Guild channels request failed')
  }
  return await res.json()
}

export const [guildChannels, { mutate: guildChannelsMutate, refetch: guildChannelsRefetch }] = createResource(
  'guilds-channels',
  fetchGuildChannels,
  { initialValue: [] },
)

// async function fetchGuildEmoji() {
//   const res = await fetchAPI("/users/:discordID/guilds/:guildID/emojis", "GET");
//   if (!res.ok) {
//     return [];
//   }
//   return await res.json();
// }

// export const [guildEmoji, { mutate: guildEmojiMutate, refetch: guildEmojiRefetch }] = createResource(
//   "guilds-emoji",
//   fetchGuildEmoji,
// );

class GuildAdmin {
  id: number
  name: string
  avatar: string

  constructor(id: number, name: string, avatar: string) {
    this.id = id
    this.name = name
    this.avatar = avatar
  }
}

async function fetchAdmins() {
  const adminsList: GuildAdmin[] = []
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/admins', 'GET')
  if (!res.ok) {
    throw new Error('Dashboard administrators request failed')
  }
  const admins = await res.json()
  for (const admin of admins) {
    adminsList.push(new GuildAdmin(admin.id, admin.name, admin.avatar))
  }
  return adminsList
}

const GuildInformations: Component = () => {
  const access = useAccess()
  const [guildAdmins, { refetch: refetchAdmins }] = createResource('guilds-admins', fetchAdmins, { initialValue: [] })
  const [bot, { mutate: setBot, refetch: refreshBot }] = createResource('bot', async () => {
    return await fetchAPI('/users/:discordID/guilds/:guildID/bot', 'GET').then(async (res) => {
      if (!res.ok) throw new Error('An error occurred while fetching the bot.')
      return await res.json()
    })
  })
  const navigate = useNavigate()
  const { t } = useI18n()
  let inviteTimer: ReturnType<typeof setInterval> | undefined
  onCleanup(() => clearInterval(inviteTimer))

  async function activateGmodStorePremium() {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/gmod-store', 'POST')
    if (!res.ok)
      return Errors(
        t('dashboard.guild.information.activation_error', 'Unable to activate GmodStore Premium. Try again.'),
      )
    const data = await res.json()
    setBot(data)
    navigate('/dashboard/guilds')
  }

  async function deactivateGmodStorePremium() {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/gmod-store', 'DELETE')
    if (!res.ok)
      return Errors(
        t('dashboard.guild.information.deactivation_error', 'Unable to deactivate GmodStore Premium. Try again.'),
      )
    const data = await res.json()
    setBot(data)
    navigate('/dashboard/guilds')
  }

  async function deactivateBot() {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/bot', 'DELETE')
    if (!res.ok)
      return Errors(t('dashboard.guild.information.bot_deactivation_error', 'Unable to deactivate the bot. Try again.'))
    const data = await res.json()
    setBot(data)
    navigate('/dashboard/guilds')
  }

  const [gmodStorePurchase, { refetch: refetchGmodStorePurchase }] = createResource('gmodStorePurchase', async () => {
    // Bug fix: was `res.json() || {}` - res.json() returns a Promise, which is always truthy, so
    // the `|| {}` fallback was dead code and never ran. Await first so a falsy/malformed JSON body
    // (e.g. `null`) actually falls back to `{}` instead of propagating into the render below.
    return await fetchAPI('/users/:discordID/gmod-store', 'GET').then(async (res) => (await res.json()) || {})
  })

  const location = useLocation()
  // Bug fix: `createEffect(fn, [location.pathname])` looked like a React-style dependency array,
  // but Solid's createEffect second argument is just the initial value passed to `fn` on the
  // first call, not a dependency list, and `fn`'s body never reads `location.pathname` - so this
  // effect only ever ran once, on mount, and roles/channels were never refetched on navigation
  // between guilds. Wrapped with `on()` so it explicitly tracks the path and re-runs on change.
  createEffect(
    on(
      () => location.pathname,
      async () => {
        await guildRolesRefetch()
        await guildChannelsRefetch()
      },
    ),
  )

  return (
    <>
      <AdminPanel
        title={t('dashboard.guild.information.title', 'Discord server overview')}
        description={t(
          'dashboard.guild.information.description',
          'Review this Discord server, its dashboard administrators and its Premium access.',
        )}
      >
        <div class="flex w-fit items-center">
          <span class="mr-2">{t('dashboard.guild.information.guild_name', 'Discord server name')}:</span>
          <span>{getGuild().name}</span>
        </div>
        <div class="flex w-fit items-center">
          <span class="mr-2">{t('dashboard.guild.information.guild_id', 'Discord server ID')}:</span>
          <span>{getGuild().id}</span>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="mr-2">{t('dashboard.guild.information.admins', 'Admins')}:</span>
          <AsyncState
            loading={guildAdmins.loading}
            error={guildAdmins.error}
            empty={!guildAdmins.loading && !guildAdmins.error && guildAdmins().length === 0}
            errorLabel={t(
              'dashboard.guild.information.admins_load_error',
              'Unable to load the dashboard administrators. Try again.',
            )}
            emptyLabel={t(
              'dashboard.guild.information.admins_empty',
              'No dashboard administrators were returned for this community.',
            )}
            onRetry={() => void refetchAdmins()}
          >
            <span>
              {!guildAdmins.error
                ? guildAdmins()
                    .map((admin) => admin.name)
                    .join(', ')
                : ''}
            </span>
          </AsyncState>
        </div>
        <div class="flex w-fit items-center">
          <span class="mr-2">{t('dashboard.guild.information.premium', 'Premium')}:</span>
          <Show
            when={access.ready() && access.snapshot()?.state === 'ready'}
            fallback={
              <span class="text-base-content/60">
                {access.loading()
                  ? t('ui.loading', 'Loading…')
                  : t('access.unavailable', 'Access could not be verified. Your saved configuration is preserved.')}
              </span>
            }
          >
            {access.snapshot()?.premium ? (
              <Icon name="check" class="text-success" />
            ) : (
              <Icon name="x" class="text-error" />
            )}
          </Show>
        </div>
        <div>
          <Icon name="triangle-alert" class="text-warning mr-2" />
          <span>
            {t(
              'dashboard.guild.information.warning',
              "These administrators can change bot settings for this Discord server and its linked Garry's Mod servers.",
            )}
          </span>
        </div>
        {/* Bug fix: also gate on !bot.error - `bot()` is read unguarded below (`!bot().active`),
            and the bot resource's fetcher throws on a non-ok response, so once `bot.loading`
            settles to false in an error state, evaluating `bot()` re-throws and crashes the whole
            page. Mirrors the `!adminData.loading && adminData()` fix in AdminInformations.tsx. */}
        <Show
          when={
            !bot.loading &&
            !bot.error &&
            !gmodStorePurchase.loading &&
            gmodStorePurchase().steamID64 &&
            !gmodStorePurchase().guild &&
            !bot().active
          }
        >
          <div class="flex w-fit items-center gap-4">
            <Button onClick={activateGmodStorePremium}>
              {t('dashboard.guild.information.activate_gmod_store_premium', 'Activate Gmod Store Premium')}
            </Button>
          </div>
        </Show>
        <Show
          when={
            !bot.loading &&
            !gmodStorePurchase.loading &&
            gmodStorePurchase().steamID64 &&
            gmodStorePurchase().guild &&
            gmodStorePurchase().guild === getGuild().id
          }
        >
          <p
            class="text-error"
            classList={{
              hidden: gmodStorePurchase().hasMainBot,
            }}
          >
            {t(
              'dashboard.guild.information.reinvite_main_bot',
              'Invite the main Gmod Integration bot to this Discord server before deactivating GmodStore Premium.',
            )}
          </p>
          <div class="flex w-fit items-center gap-4">
            <Show when={!gmodStorePurchase().hasMainBot}>
              <Button
                onClick={() => {
                  const newWindow = window.open(`/invite&guild_id=${getGuild().id}`, '_blank', 'width=600,height=900')
                  clearInterval(inviteTimer)
                  inviteTimer = setInterval(function () {
                    if (newWindow && newWindow.closed) {
                      clearInterval(inviteTimer)
                      refetchGmodStorePurchase()
                    }
                  }, 500)
                }}
              >
                {t('dashboard.guild.information.invite_main_bot', 'Invite Main Bot')}
              </Button>
            </Show>
            <Button variant="warning" onClick={deactivateGmodStorePremium} disabled={!gmodStorePurchase().hasMainBot}>
              {t('dashboard.guild.information.deactivate_gmod_store_premium', 'Deactivate Gmod Store Premium')}
            </Button>
          </div>
        </Show>
      </AdminPanel>
    </>
  )
}

export default GuildInformations
