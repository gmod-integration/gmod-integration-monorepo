import { Component, createEffect, createResource, onCleanup, Show } from 'solid-js'
import { getGuild } from '../../../utils/utils'
import AdminPanel from '../../../components/AdminPanel'
import { A, useLocation, useNavigate } from '@solidjs/router'
import { useI18n } from '../../../i18n'
import { Errors } from '../../../components/layout/Errors'
import { fetchAPI } from '../../../utils/api'

async function fetchGuildRoles() {
  return await fetchAPI('/users/:discordID/guilds/:guildID/roles', 'GET')
    .then(async (res) => {
      if (!res.ok) throw new Error('An error occurred while fetching the roles.')
      return await res.json()
    })
    .then((data) => {
      return data.sort((a, b) => a.position + b.position)
    })
}

export const [guildRoles, { mutate: guildRolesMutate, refetch: guildRolesRefetch }] = createResource(
  'guilds-roles',
  fetchGuildRoles,
)

async function fetchGuildChannels() {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/channels', 'GET')
  if (!res.ok) {
    return []
  }
  return await res.json()
}

export const [guildChannels, { mutate: guildChannelsMutate, refetch: guildChannelsRefetch }] = createResource(
  'guilds-channels',
  fetchGuildChannels,
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
    return adminsList
  }
  const admins = await res.json()
  for (const admin of admins) {
    adminsList.push(new GuildAdmin(admin.id, admin.name, admin.avatar))
  }
  return adminsList
}

const GuildInformations: Component = () => {
  const [guildAdmins] = createResource('guilds-admins', fetchAdmins)
  const [bot, { mutate: setBot, refetch: refreshBot }] = createResource('bot', async () => {
    return await fetchAPI('/users/:discordID/guilds/:guildID/bot', 'GET').then(async (res) => {
      if (!res.ok) throw new Error('An error occurred while fetching the bot.')
      return await res.json()
    })
  })
  const navigate = useNavigate()
  const { t } = useI18n()

  async function activateGmodStorePremium() {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/gmod-store', 'POST')
    if (!res.ok) return Errors('An error occurred while activating the bot.')
    const data = await res.json()
    setBot(data)
    navigate('/dashboard/guilds')
  }

  async function deactivateGmodStorePremium() {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/gmod-store', 'DELETE')
    if (!res.ok) return Errors('An error occurred while deactivating the bot.')
    const data = await res.json()
    setBot(data)
    navigate('/dashboard/guilds')
  }

  async function deactivateBot() {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/bot', 'DELETE')
    if (!res.ok) return Errors('An error occurred while deactivating the bot.')
    const data = await res.json()
    setBot(data)
    navigate('/dashboard/guilds')
  }

  const [gmodStorePurchase, { refetch: refetchGmodStorePurchase }] = createResource('gmodStorePurchase', async () => {
    return await fetchAPI('/users/:discordID/gmod-store', 'GET').then((res) => res.json() || {})
  })

  const location = useLocation()
  createEffect(async () => {
    await guildRolesRefetch()
    await guildChannelsRefetch()
  }, [location.pathname])

  return (
    <>
      <AdminPanel
        title={t('dashboard.guild.information.title', 'Informations')}
        description={t(
          'dashboard.guild.information.description',
          'Here you can see some informations about your guild, and edit some of them.',
        )}
      >
        <div class="flex w-fit items-center">
          <span class="mr-2">{t('dashboard.guild.information.guild_name', 'Guild Name')}:</span>
          <span>{getGuild().name}</span>
        </div>
        <div class="flex w-fit items-center">
          <span class="mr-2">{t('dashboard.guild.information.guild_id', 'Guild ID')}:</span>
          <span>{getGuild().id}</span>
        </div>
        <div class="flex w-fit items-center">
          <span class="mr-2">{t('dashboard.guild.information.admins', 'Admins')}:</span>
          <span>
            {!guildAdmins.loading
              ? guildAdmins()
                  .map((admin) => admin.name)
                  .join(', ')
              : 'Loading...'}
          </span>
        </div>
        <div class="flex w-fit items-center">
          <span class="mr-2">{t('dashboard.guild.information.premium', 'Premium')}:</span>
          {getGuild().isPremium ? (
            <i class="fa-solid fa-check text-success"></i>
          ) : (
            <i class="fa-solid fa-times text-error"></i>
          )}
        </div>
        <div>
          <i class="fa-solid fa-warning text-warning mr-2"></i>
          <span>
            {t(
              'dashboard.guild.information.warning',
              "Be careful, admins can manage the bot and so make modifications to your Discord Guild and your Garry's Mod Server.",
            )}
          </span>
        </div>
        <Show
          when={
            !bot.loading &&
            !gmodStorePurchase.loading &&
            gmodStorePurchase().steamID64 &&
            !gmodStorePurchase().guild &&
            !bot().active
          }
        >
          <div class="flex w-fit items-center gap-4">
            <button class="btn btn-base-200" onClick={activateGmodStorePremium}>
              {t('dashboard.guild.information.activate_gmod_store_premium', 'Activate Gmod Store Premium')}
            </button>
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
              'Before removing the Gmod Store Premium, you need to re-invite the main bot to your guild.',
            )}
          </p>
          <div class="flex w-fit items-center gap-4">
            <Show when={!gmodStorePurchase().hasMainBot}>
              <A
                href="#"
                class="btn btn-base-200"
                onClick={(e) => {
                  e.preventDefault()
                  const newWindow = window.open(`/invite&guild_id=${getGuild().id}`, '_blank', 'width=600,height=900')
                  const timer = setInterval(function () {
                    if (newWindow && newWindow.closed) {
                      clearInterval(timer)
                      refetchGmodStorePurchase()
                    }
                  }, 500)
                  onCleanup(() => clearInterval(timer))
                }}
              >
                {t('dashboard.guild.information.invite_main_bot', 'Invite Main Bot')}
              </A>
            </Show>
            <button
              class="btn btn-warning"
              onClick={deactivateGmodStorePremium}
              classList={{
                'btn-disabled': !gmodStorePurchase().hasMainBot,
              }}
            >
              {t('dashboard.guild.information.deactivate_gmod_store_premium', 'Deactivate Gmod Store Premium')}
            </button>
          </div>
        </Show>
      </AdminPanel>
    </>
  )
}

export default GuildInformations
