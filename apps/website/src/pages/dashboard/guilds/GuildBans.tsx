import { Component, createResource, For, Match, Show, Switch } from 'solid-js'
import AdminPanel from '../../../components/AdminPanel'
import { useI18n } from '../../../i18n'
import { fetchAPI } from '../../../utils/api'
import { TextValue } from '../../../components/popup/TextValue'

interface GmodBan {
  id: number
  userSteamID64: string
  adminSteamID64: string
  reason: string
  linkedDiscordID: string | null
  discordAlsoBanned: boolean
}

interface DiscordBan {
  id: string
  tag: string
  reason: string | null
  linkedSteamID64: string | null
  gmodAlsoBanned: boolean
}

interface GuildBansData {
  gmodBans: GmodBan[]
  discordBans: DiscordBan[]
}

const fetchBans = async (): Promise<GuildBansData> => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/bans', 'GET')
  if (!res.ok) {
    return { gmodBans: [], discordBans: [] }
  }
  return await res.json()
}

const GuildBans: Component = () => {
  const [bans] = createResource('guildBans', fetchBans)
  const { t } = useI18n()

  return (
    <>
      <AdminPanel
        title={t('dashboard.guild.bans.gmod_title', 'GMod Bans')}
        description={t('dashboard.guild.bans.gmod_description', 'Bans across every server in this guild.')}
        type="none"
      >
        <table class="table border-b border-base-300 rounded-none">
          <thead>
            <tr class="text-l">
              <th>{t('dashboard.guild.bans.steam_id', 'SteamID64')}</th>
              <th>{t('dashboard.guild.bans.admin', 'Admin')}</th>
              <th>{t('dashboard.guild.bans.reason', 'Reason')}</th>
              <th class="w-1/6 text-center">
                {t('dashboard.guild.bans.also_banned_discord_column', 'Also on Discord')}
              </th>
            </tr>
          </thead>
          <tbody>
            <Show when={!bans.loading && !bans.error}>
              <For each={bans()?.gmodBans}>
                {(ban) => (
                  <tr>
                    <td>
                      <TextValue value={ban.userSteamID64} />
                    </td>
                    <td>
                      <TextValue value={ban.adminSteamID64} />
                    </td>
                    <td>
                      <TextValue value={ban.reason} />
                    </td>
                    <td>
                      <div class="flex gap-2 justify-center">
                        <Show when={ban.discordAlsoBanned}>
                          <div
                            class="tooltip tooltip-warning"
                            data-tip={t('dashboard.guild.bans.also_banned_discord', 'Also banned on Discord')}
                          >
                            <i class="fa-brands fa-discord text-warning"></i>
                          </div>
                        </Show>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </Show>
          </tbody>
        </table>

        <Switch>
          <Match when={bans.loading}>
            <div class="flex justify-center h-36">
              <div class="loading loading-spinner loading-lg"></div>
            </div>
          </Match>
          <Match when={bans.error}>
            <div>{t('dashboard.guild.bans.failed_to_load', 'Failed to load bans')}</div>
          </Match>
          <Match when={!bans.loading && bans()?.gmodBans.length === 0}>
            <div class="flex justify-center p-4 text-base-content/50">
              {t('dashboard.guild.bans.gmod_empty', 'No GMod bans found.')}
            </div>
          </Match>
        </Switch>
      </AdminPanel>

      <AdminPanel
        title={t('dashboard.guild.bans.discord_title', 'Discord Bans')}
        description={t('dashboard.guild.bans.discord_description', 'Bans on this Discord server.')}
        type="none"
      >
        <table class="table border-b border-base-300 rounded-none">
          <thead>
            <tr class="text-l">
              <th>{t('dashboard.guild.bans.user', 'User')}</th>
              <th>{t('dashboard.guild.bans.reason', 'Reason')}</th>
              <th class="w-1/6 text-center">{t('dashboard.guild.bans.also_banned_gmod_column', 'Also on GMod')}</th>
            </tr>
          </thead>
          <tbody>
            <Show when={!bans.loading && !bans.error}>
              <For each={bans()?.discordBans}>
                {(ban) => (
                  <tr>
                    <td>
                      <TextValue value={ban.tag} />
                    </td>
                    <td>
                      <TextValue value={ban.reason || ''} />
                    </td>
                    <td>
                      <div class="flex gap-2 justify-center">
                        <Show when={ban.gmodAlsoBanned}>
                          <div
                            class="tooltip tooltip-warning"
                            data-tip={t('dashboard.guild.bans.also_banned_gmod', 'Also banned on GMod')}
                          >
                            <i class="fa-solid fa-gamepad text-warning"></i>
                          </div>
                        </Show>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </Show>
          </tbody>
        </table>

        <Switch>
          <Match when={bans.loading}>
            <div class="flex justify-center h-36">
              <div class="loading loading-spinner loading-lg"></div>
            </div>
          </Match>
          <Match when={bans.error}>
            <div>{t('dashboard.guild.bans.failed_to_load', 'Failed to load bans')}</div>
          </Match>
          <Match when={!bans.loading && bans()?.discordBans.length === 0}>
            <div class="flex justify-center p-4 text-base-content/50">
              {t('dashboard.guild.bans.discord_empty', 'No Discord bans found.')}
            </div>
          </Match>
        </Switch>
      </AdminPanel>
    </>
  )
}

export default GuildBans
