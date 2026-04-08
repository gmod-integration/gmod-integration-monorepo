import { Component, createResource, createSignal, For, Show } from 'solid-js'
import AdminPanel from '../../../../components/AdminPanel'
import { guildChannelsRefetch } from '../GuildInformations'
import AdminChannelSelector from '../../../../components/AdminChannelSelector'
import AdminModal from '../../../../components/AdminModal'
import { useI18n } from '../../../../i18n'
import DiscordChannel from '../../../../components/discord/DiscordChannel'
import { NeedWebsocket } from '../../../../components/popup/NeedWebsocket'
import { premium, PremiumBadge } from '../../../../utils/premium'
import { PremiumOnly } from '../../../../components/PremiumOnly'
import { fetchAPI } from '../../../../utils/api'
import { TextValue } from '../../../../components/popup/TextValue'

const fetchScreenshot = async () => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/chats', 'GET')
  if (!res.ok) {
    return {}
  }
  return await res.json()
}

const ServerChats: Component = () => {
  const [syncChats, { mutate: syncChatsMutate }] = createResource('screenshot', fetchScreenshot)
  const { t } = useI18n()

  const sendScreenshots = async (channelID: string) => {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/chats', 'POST', {
      channelID,
    })
    if (!res.ok) {
      return
    }
    const screenshot = await res.json()
    syncChatsMutate(screenshot)
    return screenshot
  }

  const removeScreenshots = async () => {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/chats', 'DELETE')
    if (!res.ok) {
      return
    }
    syncChatsMutate({})
    return {}
  }

  const [pseudoDirection, { mutate: mutatePseudoDirection }] = createResource('pseudoDirection', async () => {
    return fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/settings/syncChatDirection', 'GET').then(
      async (res) => {
        if (!res.ok) throw new Error('An error occurred while fetching the pseudo direction.')
        return (await res.json()) || {}
      },
    )
  })

  const [gmToDscFilterRelayAll, { mutate: mutateGmToDscFilterRelayAll }] = createResource(
    'gmToDscFilterRelayAll',
    async () => {
      return fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/settings/chat_sync_relay_all', 'GET').then(
        async (res) => {
          if (!res.ok) throw new Error('An error occurred while fetching the pseudo direction.')
          return (await res.json()) || {}
        },
      )
    },
  )

  function updateGmToDscFilterRelayAll(relayAll: boolean) {
    fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/settings/chat_sync_relay_all', 'PUT', {
      value: relayAll,
    })
      .then((res) => {
        if (res.ok) {
          return res.json()
        } else {
          throw new Error('An error occurred while updating the pseudo direction.')
        }
      })
      .then((data) => {
        mutateGmToDscFilterRelayAll(data)
      })
  }

  const [preventChatPing, { mutate: mutatePreventChatPing }] = createResource('preventChatPing', async () => {
    return fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/settings/sync_chat_prevent_ping', 'GET').then(
      async (res) => {
        if (!res.ok) throw new Error('An error occurred while fetching the prevent chat ping.')
        return (await res.json()) || {}
      },
    )
  })

  function updatePreventChatPing(preventPing: boolean) {
    fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/settings/sync_chat_prevent_ping', 'PUT', {
      value: preventPing,
    })
      .then((res) => {
        if (res.ok) {
          return res.json()
        } else {
          throw new Error('An error occurred while updating the prevent chat ping.')
        }
      })
      .then((data) => {
        mutatePreventChatPing(data)
      })
  }

  const [gmToDscFilters, { mutate: mutateGmToDscFilters }] = createResource('gmToDscFilters', async () => {
    return fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/chats/filters', 'GET').then(async (res) => {
      if (!res.ok) throw new Error('An error occurred while fetching the pseudo direction.')
      return (await res.json()) || {}
    })
  })

  function addGmToDscFilter() {
    fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/chats/filters', 'POST')
      .then((res) => {
        if (res.ok) {
          return res.json()
        } else {
          throw new Error('An error occurred while adding the role.')
        }
      })
      .then((data) => {
        mutateGmToDscFilters((prev) => [...prev, data])
      })
  }

  function deleteGmToDscFilter(roleID: string) {
    fetchAPI(`/users/:discordID/guilds/:guildID/servers/:serverID/chats/filters/${roleID}`, 'DELETE')
      .then((res) => {
        if (res.ok) {
          return res.json()
        } else {
          throw new Error('An error occurred while deleting the role.')
        }
      })
      .then((data) => {
        mutateGmToDscFilters((prev) => prev.filter((r) => r.id !== data.id))
      })
  }

  const [selectFilter, setSelectFilter] = createSignal({})

  function editGmToDscFilter() {
    fetchAPI(
      `/users/:discordID/guilds/:guildID/servers/:serverID/chats/filters/${selectFilter().id}`,
      'PUT',
      selectFilter(),
    )
      .then((res) => {
        if (res.ok) {
          return res.json()
        } else {
          throw new Error('An error occurred while editing the role.')
        }
      })
      .then((data) => {
        mutateGmToDscFilters((prev) => prev.map((r) => (r.id === data.id ? data : r)))
        setSelectFilter({})
      })
  }

  function updateSyncPseudoDirection(direction: string) {
    fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/settings/syncChatDirection', 'PUT', {
      value: direction,
    })
      .then((res) => {
        if (res.ok) {
          return res.json()
        } else {
          throw new Error('An error occurred while updating the pseudo direction.')
        }
      })
      .then((data) => {
        mutatePseudoDirection(data)
      })
  }

  function getSelectorClassList(direction: string) {
    return !pseudoDirection.loading ? pseudoDirection().value === direction : false
  }

  return (
    <>
      <NeedWebsocket />
      <AdminChannelSelector id="select_channel_modal" callback={sendScreenshots} />

      <AdminModal title={t('dashboard.server.chat.edit_rule', 'Edit Rule')} id="edit_rule_modal">
        <div class="fieldset">
          <label class="label">
            <span>{t('dashboard.server.chat.element', 'Element')}</span>
          </label>
          <select
            class="select"
            disabled={gmToDscFilters.loading}
            onChange={(e) => {
              selectFilter().element = e.currentTarget.value
            }}
          >
            <option value="message" selected={selectFilter().element === 'message'}>
              {t('dashboard.server.chat.message', 'Message')}
            </option>
            <option value="userGroup" selected={selectFilter().element === 'userGroup'}>
              {t('dashboard.server.chat.user_group', 'User Group')}
            </option>
            <option value="steamID64" selected={selectFilter().element === 'steamID64'}>
              {t('dashboard.server.chat.steam_id_64', 'Steam ID 64')}
            </option>
            <option value="teamName" selected={selectFilter().element === 'teamName'}>
              {t('dashboard.server.chat.team_name', 'Team Name')}
            </option>
          </select>
        </div>
        <div class="fieldset">
          <label class="label">
            <span>{t('dashboard.server.chat.operator', 'Operator')}</span>
          </label>
          <select
            disabled={gmToDscFilters.loading}
            class="select"
            onChange={(e) => {
              selectFilter().operator = e.currentTarget.value
            }}
          >
            <option value="contain" selected={selectFilter().operator === 'contain'}>
              {t('dashboard.server.chat.contain', 'Contain')}
            </option>
            <option value="notContain" selected={selectFilter().operator === 'notContain'}>
              {t('dashboard.server.chat.not_contain', 'Not Contain')}
            </option>
            <option value="equal" selected={selectFilter().operator === 'equal'}>
              {t('dashboard.server.chat.equal', 'Equal')}
            </option>
            <option value="notEqual" selected={selectFilter().operator === 'notEqual'}>
              {t('dashboard.server.chat.not_equal', 'Not Equal')}
            </option>
            <option value="startWith" selected={selectFilter().operator === 'startWith'}>
              {t('dashboard.server.chat.start_with', 'Start With')}
            </option>
            <option value="endWith" selected={selectFilter().operator === 'endWith'}>
              {t('dashboard.server.chat.end_with', 'End With')}
            </option>
          </select>
        </div>
        <div class="fieldset">
          <label class="label">
            <span>{t('dashboard.server.chat.trigger', 'Trigger')}</span>
          </label>
          <input
            type="text"
            disabled={gmToDscFilters.loading}
            class="input"
            value={selectFilter().trigger}
            onInput={(e) => {
              selectFilter().trigger = e.currentTarget.value
            }}
          />
        </div>
        <div class="fieldset">
          <label class="label">
            <span>{t('dashboard.server.chat.actions_on_match', 'Actions on Match')}</span>
          </label>
          <select
            disabled={gmToDscFilters.loading}
            class="select"
            onChange={(e) => {
              selectFilter().action = e.currentTarget.value
            }}
          >
            <option value="block" selected={selectFilter().action === 'block'}>
              {t('dashboard.server.chat.block', 'Block')}
            </option>
            <option value="relay" selected={selectFilter().action === 'relay'}>
              {t('dashboard.server.chat.relay', 'Relay')}
            </option>
            <option value="anonymize" selected={selectFilter().action === 'anonymize'}>
              {t('dashboard.server.chat.anonymize', 'Anonymize')}
            </option>
          </select>
        </div>
        <div class="fieldset">
          <label class="label">
            <span>{t('dashboard.server.chat.active', 'Active')}</span>
          </label>
          <select
            disabled={gmToDscFilters.loading}
            class="select"
            onChange={(e) => {
              selectFilter().active = e.currentTarget.value === 'true'
            }}
          >
            <option value="true" selected={selectFilter().active === true}>
              {t('dashboard.server.chat.yes', 'Yes')}
            </option>
            <option value="false" selected={selectFilter().active === false}>
              {t('dashboard.server.chat.no', 'No')}
            </option>
          </select>
        </div>
        <button
          class="btn btn-base-200 mt-2"
          disabled={gmToDscFilters.loading}
          onClick={async () => {
            // @ts-expect-error -- intentional: legacy typing gap
            edit_rule_modal.close()
            editGmToDscFilter()
          }}
        >
          {t('dashboard.server.chat.save', 'Save')}
        </button>
      </AdminModal>

      <AdminPanel
        title={t('dashboard.server.chat.chats', 'Chats')}
        description={t(
          'dashboard.server.chat.set_channel',
          'Set a channel to sync the chats between your server and Discord.',
        )}
      >
        <div class="flex w-fit items-center">
          <span class="mr-2">{t('dashboard.server.chat.chats_channels', 'Actual Chats Channels') + ' : '}</span>
          <Show
            when={!syncChats.loading && syncChats().channel}
            fallback={<span>{t('dashboard.server.chat.no_sync_chats', 'No Sync Chats')}</span>}
          >
            <DiscordChannel channelID={syncChats().channel} />
          </Show>
        </div>
        <div class="flex w-fit items-center">
          <PremiumBadge onlyIcon={true} />
          <span class="mr-2 text-nowrap">
            {t('dashboard.server.chat.sync_direction', 'Chats Synchronization Direction') + ' : '}
          </span>
          <select
            class="select w-full max-w-xs"
            disabled={pseudoDirection.loading}
            onChange={(e) => {
              updateSyncPseudoDirection(e.currentTarget.value)
            }}
          >
            <option value="discordToGmod" selected={getSelectorClassList('discordToGmod')} disabled={!premium()}>
              {t('dashboard.server.chat.from_discord_to_gmod', 'From Discord to Gmod')} <PremiumOnly />
            </option>
            <option value="gmodToDiscord" selected={getSelectorClassList('gmodToDiscord')}>
              {t('dashboard.server.chat.from_gmod_to_discord', 'From Gmod to Discord')}
            </option>
            <option value="both" selected={getSelectorClassList('both')} disabled={!premium()}>
              {t('dashboard.server.chat.both_ways', 'Both Ways')} <PremiumOnly />
            </option>
          </select>
        </div>
        <div class="flex w-fit items-center">
          <span class="mr-2">{t('dashboard.server.chat.prevent_chat_ping', 'Prevent Chat Ping') + ' : '}</span>
          <input
            type="checkbox"
            class="toggle toggle-md"
            disabled={preventChatPing.loading}
            checked={!preventChatPing.loading ? preventChatPing().value : false}
            onChange={(e) => {
              updatePreventChatPing(e.currentTarget.checked)
            }}
          />
        </div>
        <div class="flex gap-4">
          <Show when={!syncChats.loading && syncChats().channel}>
            <button
              class="btn btn-warning"
              onClick={async () => {
                await removeScreenshots()
              }}
            >
              {t('dashboard.server.chat.remove_channel', 'Remove Channel')}
            </button>
          </Show>
          <button
            class="btn btn-base-200"
            onClick={() => {
              // @ts-expect-error -- intentional: legacy typing gap
              select_channel_modal.showModal()
              guildChannelsRefetch()
            }}
          >
            {t('dashboard.server.chat.select_channel', 'Select Channel')}
          </button>
        </div>
      </AdminPanel>

      <AdminPanel
        title={t('dashboard.server.chat.gmod_to_discord_filter', 'Gmod to Discord Filter')}
        description={t(
          'dashboard.server.chat.add_rules',
          'Add specific rules to filter the messages sent from Gmod to Discord.',
        )}
        type="none"
        premium={true}
      >
        <div class="p-4 flex w-fit items-center">
          <span class="mr-2 text-nowrap">
            {t('dashboard.server.chat.default_behavior', 'Comportement by Default : ')}
          </span>
          <select
            class="select w-full max-w-xs"
            disabled={!premium() || gmToDscFilterRelayAll.loading}
            onChange={(e) => {
              updateGmToDscFilterRelayAll(e.currentTarget.value === 'true')
            }}
          >
            <Show
              when={!gmToDscFilterRelayAll.loading}
              fallback={<div>{t('dashboard.server.chat.loading', 'Loading...')}</div>}
            >
              <option value="true" selected={gmToDscFilterRelayAll().value === true}>
                {t('dashboard.server.chat.relay_all_messages', 'Relay All Messages')}
              </option>
              <option value="false" selected={gmToDscFilterRelayAll().value === false}>
                {t('dashboard.server.chat.block_all_messages', 'Block All Messages')}
              </option>
            </Show>
          </select>
        </div>

        <table class="table border-b border-base-300 rounded-none">
          <thead>
            <tr class="text-l">
              <th>{t('dashboard.server.chat.element', 'Element')}</th>
              <th>{t('dashboard.server.chat.operator', 'Operator')}</th>
              <th>{t('dashboard.server.chat.trigger', 'Trigger')}</th>
              <th>{t('dashboard.server.chat.actions_on_match', 'Actions on Match')}</th>
              <th class="w-1/6 text-center">{t('dashboard.server.chat.active', 'Active')}</th>
              <th class="w-1/6 text-center">{t('dashboard.server.chat.actions', 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
            <Show
              when={!gmToDscFilters.loading}
              fallback={
                <div class="flex justify-center h-36">
                  <div class="loading loading-spinner loading-lg"></div>
                </div>
              }
            >
              <For each={gmToDscFilters()}>
                {(rule) => (
                  <tr>
                    <td>{rule.element}</td>
                    <td>{rule.operator}</td>
                    <td>
                      <TextValue value={rule.trigger} />
                    </td>
                    <td>{rule.action}</td>
                    <td>
                      <div class="flex gap-2 justify-center">
                        {rule.active ? (
                          <i class="fa-solid fa-check text-success"></i>
                        ) : (
                          <i class="fa-solid fa-times text-error"></i>
                        )}
                      </div>
                    </td>
                    <td>
                      <div class="flex gap-2 justify-center">
                        <div class="tooltip tooltip-info" data-tip={t('dashboard.server.chat.edit', 'Edit')}>
                          <i
                            class="hover:cursor-pointer fa-solid fa-edit"
                            onClick={() => {
                              // @ts-expect-error -- intentional: legacy typing gap
                              edit_rule_modal.showModal()
                              setSelectFilter(rule)
                            }}
                          ></i>
                        </div>
                        <div class="tooltip tooltip-error" data-tip={t('dashboard.server.chat.delete', 'Delete')}>
                          <i
                            class="hover:cursor-pointer fa-solid fa-trash text-error"
                            onClick={() => deleteGmToDscFilter(rule.id)}
                          ></i>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </Show>
          </tbody>
        </table>

        <div class="flex gap-4 p-4">
          <button
            class="btn btn-base-200"
            disabled={!premium() || gmToDscFilters.loading}
            classList={{
              'btn-disabled': !premium(),
            }}
            onClick={addGmToDscFilter}
          >
            {t('dashboard.server.chat.add_rule', 'Add Rule')}
          </button>
        </div>
      </AdminPanel>
    </>
  )
}

export default ServerChats
