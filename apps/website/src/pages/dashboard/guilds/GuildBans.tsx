import { type Component, createResource, For } from 'solid-js'
import { TableState, StatusBadge } from '../../../components/ui/index.js'
import Pagination from '../../../components/Pagination.js'
import { createListPagination } from '../../../hooks/createListPagination.js'
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
    throw new Error('Bans request failed')
  }
  return await res.json()
}

const GuildBans: Component = () => {
  const [bans, { refetch }] = createResource('guildBans', fetchBans)
  const { t } = useI18n()
  const gmodPagination = createListPagination(() => (!bans.error ? bans()?.gmodBans : undefined))
  const discordPagination = createListPagination(() => (!bans.error ? bans()?.discordBans : undefined))

  return (
    <>
      <p class="text-sm text-base-content/70">
        {t(
          'dashboard.guild.bans.cross_platform_help',
          'Cross-platform indicators require linked Steam and Discord accounts. No indicator can also mean that no linked account was found.',
        )}
      </p>
      <AdminPanel
        title={t('dashboard.guild.bans.gmod_title', 'GMod Bans')}
        description={t(
          'dashboard.guild.bans.gmod_description',
          "View up to 1,000 recent bans recorded by the Garry's Mod servers linked to this Discord server. The Discord indicator identifies matching bans on Discord.",
        )}
        type="none"
        footer={
          !bans.loading && !bans.error && gmodPagination.visible() ? (
            <Pagination
              standalone
              query={gmodPagination.query()}
              total={gmodPagination.total()}
              onChange={gmodPagination.onChange}
            />
          ) : undefined
        }
      >
        <table class="table rounded-none">
          <thead>
            <tr class="text-l">
              <th>{t('dashboard.guild.bans.steam_id', 'Player SteamID64')}</th>
              <th>{t('dashboard.guild.bans.admin', 'Admin')}</th>
              <th>{t('dashboard.guild.bans.reason', 'Reason')}</th>
              <th class="w-1/6 text-center">
                {t('dashboard.guild.bans.also_banned_discord_column', 'Also banned on Discord')}
              </th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={4}
              loading={bans.loading}
              error={bans.error}
              empty={!bans.loading && !bans.error && bans()?.gmodBans.length === 0}
              errorLabel={t('dashboard.guild.bans.failed_to_load', 'Unable to load bans. Try again.')}
              emptyLabel={t('dashboard.guild.bans.gmod_empty', 'No GMod bans found.')}
              onRetry={() => void refetch()}
            >
              <For each={gmodPagination.items()}>
                {(ban) => (
                  <tr>
                    <td>
                      <TextValue value={ban.userSteamID64} />
                    </td>
                    <td>
                      <TextValue value={ban.adminSteamID64} />
                    </td>
                    <td>
                      <TextValue value={ban.reason || t('dashboard.guild.bans.no_reason', 'No reason provided')} />
                    </td>
                    <td>
                      <div class="flex gap-2 justify-center">
                        <StatusBadge
                          tone={ban.discordAlsoBanned ? 'warning' : 'neutral'}
                          icon={ban.discordAlsoBanned ? 'message-circle' : ban.linkedDiscordID ? 'circle-help' : 'link'}
                        >
                          {ban.discordAlsoBanned
                            ? t('dashboard.guild.bans.also_banned_discord', 'Also banned on Discord')
                            : ban.linkedDiscordID
                              ? t('dashboard.guild.bans.no_matching_ban', 'No match in these records')
                              : t('dashboard.guild.bans.no_linked_account', 'No linked account')}
                        </StatusBadge>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </TableState>
          </tbody>
        </table>
      </AdminPanel>

      <AdminPanel
        title={t('dashboard.guild.bans.discord_title', 'Discord Bans')}
        description={t(
          'dashboard.guild.bans.discord_description',
          'View bans from this Discord server. The GMod indicator identifies linked Steam accounts found in the game-server ban records above.',
        )}
        type="none"
        footer={
          !bans.loading && !bans.error && discordPagination.visible() ? (
            <Pagination
              standalone
              query={discordPagination.query()}
              total={discordPagination.total()}
              onChange={discordPagination.onChange}
            />
          ) : undefined
        }
      >
        <table class="table rounded-none">
          <thead>
            <tr class="text-l">
              <th>{t('dashboard.guild.bans.user', 'User')}</th>
              <th>{t('dashboard.guild.bans.reason', 'Reason')}</th>
              <th class="w-1/6 text-center">
                {t('dashboard.guild.bans.also_banned_gmod_column', 'Also banned on GMod')}
              </th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={3}
              loading={bans.loading}
              error={bans.error}
              empty={!bans.loading && !bans.error && bans()?.discordBans.length === 0}
              errorLabel={t('dashboard.guild.bans.failed_to_load', 'Unable to load bans. Try again.')}
              emptyLabel={t('dashboard.guild.bans.discord_empty', 'No Discord bans found.')}
              onRetry={() => void refetch()}
            >
              <For each={discordPagination.items()}>
                {(ban) => (
                  <tr>
                    <td>
                      <TextValue value={ban.tag} />
                    </td>
                    <td>
                      <TextValue value={ban.reason || t('dashboard.guild.bans.no_reason', 'No reason provided')} />
                    </td>
                    <td>
                      <div class="flex gap-2 justify-center">
                        <StatusBadge
                          tone={ban.gmodAlsoBanned ? 'warning' : 'neutral'}
                          icon={ban.gmodAlsoBanned ? 'gamepad-2' : ban.linkedSteamID64 ? 'circle-help' : 'link'}
                        >
                          {ban.gmodAlsoBanned
                            ? t('dashboard.guild.bans.also_banned_gmod', 'Also banned on GMod')
                            : ban.linkedSteamID64
                              ? t('dashboard.guild.bans.no_matching_ban', 'No match in these records')
                              : t('dashboard.guild.bans.no_linked_account', 'No linked account')}
                        </StatusBadge>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </TableState>
          </tbody>
        </table>
      </AdminPanel>
    </>
  )
}

export default GuildBans
