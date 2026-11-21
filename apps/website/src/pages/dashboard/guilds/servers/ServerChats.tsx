import { closeDialog, showDialog } from '../../../../utils/dialog.js'
import { type Component, createResource, createSignal, For, Show } from 'solid-js'
import AdminPanel from '../../../../components/AdminPanel'
import { guildChannelsRefetch } from '../GuildInformations'
import AdminChannelSelector from '../../../../components/AdminChannelSelector'
import AdminModal from '../../../../components/AdminModal'
import { useI18n } from '../../../../i18n'
import DiscordChannel from '../../../../components/discord/DiscordChannel'
import { NeedWebsocket } from '../../../../components/popup/NeedWebsocket'
import { premium } from '../../../../utils/premium'
import { PremiumOnly } from '../../../../components/PremiumOnly'
import { fetchAPI } from '../../../../utils/api'
import { TextValue } from '../../../../components/popup/TextValue'
import {
  Button,
  FormActions,
  FormField,
  IconButton,
  TableState,
  Icon,
  SettingGroup,
  SettingRow,
} from '../../../../components/ui/index.js'
import { createAsyncAction } from '../../../../hooks/createAsyncAction.js'

const fetchScreenshot = async () => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/chats', 'GET')
  if (!res.ok) {
    return {}
  }
  return await res.json()
}

type ChatFilter = {
  id: number
  element: string
  operator: string
  trigger: string
  action: string
  active: boolean
}

const emptyFilter = (): ChatFilter => ({ id: 0, element: '', operator: '', trigger: '', action: '', active: false })

const ServerChats: Component = () => {
  const [syncChats, { mutate: syncChatsMutate }] = createResource('screenshot', fetchScreenshot)
  const { t } = useI18n()
  const ruleSave = createAsyncAction({ errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.') })
  const channelRemoval = createAsyncAction({
    errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.'),
  })
  const directionSave = createAsyncAction({
    errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.'),
  })
  const relaySave = createAsyncAction({ errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.') })
  const pingSave = createAsyncAction({ errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.') })

  const sendScreenshots = async (channelID: string) => {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/chats', 'POST', {
      channelID,
    })
    if (!res.ok) {
      throw new Error('Channel update failed')
    }
    const screenshot = await res.json()
    syncChatsMutate(screenshot)
    return screenshot
  }

  const removeScreenshots = async () => {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/chats', 'DELETE')
    if (!res.ok) {
      throw new Error('Channel removal failed')
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

  async function updateGmToDscFilterRelayAll(relayAll: boolean) {
    if (relaySave.pending()) return
    const previous = gmToDscFilterRelayAll()
    mutateGmToDscFilterRelayAll({ ...previous, value: relayAll })
    if (
      !(await relaySave.run(async () => {
        const res = await fetchAPI(
          '/users/:discordID/guilds/:guildID/servers/:serverID/settings/chat_sync_relay_all',
          'PUT',
          { value: relayAll },
        )
        if (!res.ok) throw new Error('Relay setting update failed')
        mutateGmToDscFilterRelayAll(await res.json())
      }))
    )
      mutateGmToDscFilterRelayAll(previous)
  }

  const [preventChatPing, { mutate: mutatePreventChatPing }] = createResource('preventChatPing', async () => {
    return fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/settings/sync_chat_prevent_ping', 'GET').then(
      async (res) => {
        if (!res.ok) throw new Error('An error occurred while fetching the prevent chat ping.')
        return (await res.json()) || {}
      },
    )
  })

  async function updatePreventChatPing(preventPing: boolean) {
    if (pingSave.pending()) return
    const previous = preventChatPing()
    mutatePreventChatPing({ ...previous, value: preventPing })
    if (
      !(await pingSave.run(async () => {
        const res = await fetchAPI(
          '/users/:discordID/guilds/:guildID/servers/:serverID/settings/sync_chat_prevent_ping',
          'PUT',
          { value: preventPing },
        )
        if (!res.ok) throw new Error('Ping setting update failed')
        mutatePreventChatPing(await res.json())
      }))
    )
      mutatePreventChatPing(previous)
  }

  const [gmToDscFilters, { mutate: mutateGmToDscFilters }] = createResource(
    'gmToDscFilters',
    async (): Promise<ChatFilter[]> => {
      return fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/chats/filters', 'GET').then(async (res) => {
        if (!res.ok) throw new Error('An error occurred while fetching the pseudo direction.')
        return (await res.json()) || []
      })
    },
    { initialValue: [] },
  )

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
      .catch((error) => console.error(error))
  }

  function deleteGmToDscFilter(roleID: number) {
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
      .catch((error) => console.error(error))
  }

  const [selectFilter, setSelectFilter] = createSignal<ChatFilter>(emptyFilter())
  const discardRule = () => {
    setSelectFilter(emptyFilter())
    ruleSave.reset()
  }

  async function editGmToDscFilter() {
    const res = await fetchAPI(
      `/users/:discordID/guilds/:guildID/servers/:serverID/chats/filters/${selectFilter().id}`,
      'PUT',
      selectFilter(),
    )
    if (!res.ok) throw new Error('An error occurred while editing the rule.')
    const data = await res.json()
    mutateGmToDscFilters((prev) => prev.map((rule) => (rule.id === data.id ? data : rule)))
  }

  async function updateSyncPseudoDirection(direction: string) {
    if (directionSave.pending()) return
    const previous = pseudoDirection()
    mutatePseudoDirection({ ...previous, value: direction })
    if (
      !(await directionSave.run(async () => {
        const res = await fetchAPI(
          '/users/:discordID/guilds/:guildID/servers/:serverID/settings/syncChatDirection',
          'PUT',
          { value: direction },
        )
        if (!res.ok) throw new Error('Direction update failed')
        mutatePseudoDirection(await res.json())
      }))
    )
      mutatePseudoDirection(previous)
  }

  function getSelectorClassList(direction: string) {
    return !pseudoDirection.loading ? pseudoDirection().value === direction : false
  }

  const filterLabels = () => ({
    message: t('dashboard.server.chat.message', 'Message'),
    userGroup: t('dashboard.server.chat.user_group', 'User Group'),
    steamID64: t('dashboard.server.chat.steam_id_64', 'Steam ID 64'),
    teamName: t('dashboard.server.chat.team_name', 'Team Name'),
    contain: t('dashboard.server.chat.contain', 'Contain'),
    notContain: t('dashboard.server.chat.not_contain', 'Not Contain'),
    equal: t('dashboard.server.chat.equal', 'Equal'),
    notEqual: t('dashboard.server.chat.not_equal', 'Not Equal'),
    startWith: t('dashboard.server.chat.start_with', 'Start With'),
    endWith: t('dashboard.server.chat.end_with', 'End With'),
    block: t('dashboard.server.chat.block', 'Block'),
    relay: t('dashboard.server.chat.relay', 'Relay'),
    anonymize: t('dashboard.server.chat.anonymize', 'Anonymize'),
  })
  const filterLabel = (value: string) => filterLabels()[value as keyof ReturnType<typeof filterLabels>] ?? value

  return (
    <>
      <NeedWebsocket />
      <AdminChannelSelector id="select_channel_modal" callback={sendScreenshots} />

      <AdminModal
        title={t('dashboard.server.chat.edit_rule', 'Edit Rule')}
        id="edit_rule_modal"
        busy={ruleSave.pending()}
        onClose={discardRule}
        onCancel={discardRule}
      >
        <FormField id="chat-rule-element" label={t('dashboard.server.chat.element', 'Element')}>
          <select
            id="chat-rule-element"
            class="select"
            disabled={gmToDscFilters.loading || ruleSave.pending()}
            onChange={(e) => {
              setSelectFilter((previous) => ({ ...previous, element: e.currentTarget.value }))
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
        </FormField>
        <FormField id="chat-rule-operator" label={t('dashboard.server.chat.operator', 'Operator')}>
          <select
            id="chat-rule-operator"
            disabled={gmToDscFilters.loading || ruleSave.pending()}
            class="select"
            onChange={(e) => {
              setSelectFilter((previous) => ({ ...previous, operator: e.currentTarget.value }))
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
        </FormField>
        <FormField id="chat-rule-trigger" label={t('dashboard.server.chat.trigger', 'Trigger')}>
          <input
            id="chat-rule-trigger"
            type="text"
            disabled={gmToDscFilters.loading || ruleSave.pending()}
            class="input"
            value={selectFilter().trigger}
            onInput={(e) => {
              setSelectFilter((previous) => ({ ...previous, trigger: e.currentTarget.value }))
            }}
          />
        </FormField>
        <FormField id="chat-rule-action" label={t('dashboard.server.chat.actions_on_match', 'Actions on Match')}>
          <select
            id="chat-rule-action"
            disabled={gmToDscFilters.loading || ruleSave.pending()}
            class="select"
            onChange={(e) => {
              setSelectFilter((previous) => ({ ...previous, action: e.currentTarget.value }))
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
        </FormField>
        <FormField id="chat-rule-active" label={t('dashboard.server.chat.active', 'Active')}>
          <select
            id="chat-rule-active"
            disabled={gmToDscFilters.loading || ruleSave.pending()}
            class="select"
            onChange={(e) => {
              setSelectFilter((previous) => ({ ...previous, active: e.currentTarget.value === 'true' }))
            }}
          >
            <option value="true" selected={selectFilter().active === true}>
              {t('dashboard.server.chat.yes', 'Yes')}
            </option>
            <option value="false" selected={selectFilter().active === false}>
              {t('dashboard.server.chat.no', 'No')}
            </option>
          </select>
        </FormField>
        <FormActions
          pending={ruleSave.pending()}
          disabled={gmToDscFilters.loading || !!gmToDscFilters.error}
          error={ruleSave.error()}
          saveLabel={t('dashboard.server.chat.save', 'Save')}
          onSave={() => {
            void ruleSave.run(editGmToDscFilter).then((saved) => {
              if (saved) closeDialog('edit_rule_modal')
            })
          }}
          onCancel={() => closeDialog('edit_rule_modal')}
        />
      </AdminModal>

      <AdminPanel
        title={t('dashboard.server.chat.chats', 'Chats')}
        description={t(
          'dashboard.server.chat.set_channel',
          'Set a channel to sync the chats between your server and Discord.',
        )}
      >
        <SettingGroup title={t('settings.chat_destination', 'Discord destination')} icon="messages-square">
          <SettingRow
            title={t('dashboard.server.chat.chats_channels', 'Actual Chats Channels')}
            description={t(
              'settings.chat_destination_help',
              'Messages are relayed through this channel. Select a channel to connect the relay.',
            )}
            feedback={
              <>
                <Show when={channelRemoval.error()}>
                  <p role="alert" class="text-error">
                    {channelRemoval.error()}
                  </p>
                </Show>
              </>
            }
          >
            <div class="flex flex-wrap items-center gap-3">
              <Show
                when={!syncChats.loading && syncChats().channel}
                fallback={<span>{t('dashboard.server.chat.no_sync_chats', 'No Sync Chats')}</span>}
              >
                <DiscordChannel channelID={syncChats().channel} />
              </Show>{' '}
              <div class="flex gap-4">
                <Show when={!syncChats.loading && syncChats().channel}>
                  <Button
                    variant="danger"
                    loading={channelRemoval.pending()}
                    onClick={() => void channelRemoval.run(removeScreenshots)}
                  >
                    {t('dashboard.server.chat.remove_channel', 'Remove Channel')}
                  </Button>
                </Show>
                <Button
                  disabled={channelRemoval.pending()}
                  onClick={() => {
                    showDialog('select_channel_modal')
                    guildChannelsRefetch()
                  }}
                >
                  {t('dashboard.server.chat.select_channel', 'Select Channel')}
                </Button>
              </div>
            </div>
          </SettingRow>
        </SettingGroup>
        <SettingGroup title={t('settings.sync_behavior', 'Synchronization behavior')} icon="arrow-left-right">
          <SettingRow
            controlId="chat-direction"
            title={t('dashboard.server.chat.sync_direction', 'Chats Synchronization Direction')}
            description={t(
              'settings.chat_direction_help',
              'Choose which side can send messages through the relay. Changes are saved automatically.',
            )}
            feedback={
              <>
                <Show when={directionSave.pending()}>
                  <span
                    role="status"
                    aria-label={t('ui.loading', 'Loading…')}
                    class="loading loading-spinner loading-sm"
                  />
                </Show>
                <Show when={directionSave.error()}>
                  <span role="alert" class="text-sm text-error">
                    {directionSave.error()}
                  </span>
                </Show>
                <Show when={directionSave.success()}>
                  <span role="status" class="text-sm text-success">
                    {t('ui.saved', 'Saved')}
                  </span>
                </Show>
              </>
            }
          >
            <select
              id="chat-direction"
              aria-describedby="chat-direction-description"
              aria-label={t('dashboard.server.chat.sync_direction', 'Chats Synchronization Direction')}
              class="select w-full max-w-xs"
              disabled={pseudoDirection.loading || directionSave.pending()}
              aria-busy={directionSave.pending() || undefined}
              value={!pseudoDirection.loading ? pseudoDirection().value : ''}
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
          </SettingRow>
          <SettingRow
            controlId="chat-prevent-ping"
            title={t('dashboard.server.chat.prevent_chat_ping', 'Prevent Chat Ping')}
            description={t(
              'settings.chat_ping_help',
              'Prevent relayed messages from mentioning Discord members and roles.',
            )}
            feedback={
              <>
                <Show when={pingSave.pending()}>
                  <span
                    role="status"
                    aria-label={t('ui.loading', 'Loading…')}
                    class="loading loading-spinner loading-sm"
                  />
                </Show>
                <Show when={pingSave.error()}>
                  <span role="alert" class="text-sm text-error">
                    {pingSave.error()}
                  </span>
                </Show>
                <Show when={pingSave.success()}>
                  <span role="status" class="text-sm text-success">
                    {t('ui.saved', 'Saved')}
                  </span>
                </Show>
              </>
            }
          >
            <input
              id="chat-prevent-ping"
              aria-describedby="chat-prevent-ping-description"
              aria-label={t('dashboard.server.chat.prevent_chat_ping', 'Prevent Chat Ping')}
              type="checkbox"
              class="toggle toggle-md"
              disabled={preventChatPing.loading || pingSave.pending()}
              aria-busy={pingSave.pending() || undefined}
              checked={!preventChatPing.loading ? preventChatPing().value : false}
              onChange={(e) => {
                updatePreventChatPing(e.currentTarget.checked)
              }}
            />
          </SettingRow>
          <Show when={!premium()}>
            <p class="settings-notice">
              <Icon name="crown" size={16} />
              {t('settings.sync_premium_help', 'Discord to game and two-way synchronization require Premium.')}
            </p>
          </Show>
        </SettingGroup>
      </AdminPanel>

      <AdminPanel
        title={t('dashboard.server.chat.gmod_to_discord_filter', 'Gmod to Discord Filter')}
        description={t('ui.autosave', 'Changes are saved automatically.')}
        icon="sliders-horizontal"
        premium={true}
      >
        <SettingRow
          controlId="chat-default-behavior"
          title={t('dashboard.server.chat.default_behavior', 'Default behavior')}
          description={t(
            'settings.chat_default_help',
            'Choose whether game messages are relayed or blocked by default. Configure exceptions in the rules below.',
          )}
          feedback={
            <>
              <Show when={relaySave.pending()}>
                <span
                  role="status"
                  aria-label={t('ui.loading', 'Loading…')}
                  class="loading loading-spinner loading-sm"
                />
              </Show>
              <Show when={relaySave.error()}>
                <span role="alert" class="text-sm text-error">
                  {relaySave.error()}
                </span>
              </Show>
              <Show when={relaySave.success()}>
                <span role="status" class="text-sm text-success">
                  {t('ui.saved', 'Saved')}
                </span>
              </Show>
            </>
          }
        >
          <select
            id="chat-default-behavior"
            aria-describedby="chat-default-behavior-description"
            aria-label={t('dashboard.server.chat.default_behavior', 'Default behavior')}
            class="select w-full max-w-xs"
            disabled={!premium() || gmToDscFilterRelayAll.loading || relaySave.pending()}
            aria-busy={relaySave.pending() || undefined}
            value={!gmToDscFilterRelayAll.loading ? String(gmToDscFilterRelayAll().value) : ''}
            onChange={(e) => {
              updateGmToDscFilterRelayAll(e.currentTarget.value === 'true')
            }}
          >
            <Show
              when={!gmToDscFilterRelayAll.loading}
              fallback={<option value="">{t('dashboard.server.chat.loading', 'Loading...')}</option>}
            >
              <option value="true" selected={gmToDscFilterRelayAll().value === true}>
                {t('dashboard.server.chat.relay_all_messages', 'Relay All Messages')}
              </option>
              <option value="false" selected={gmToDscFilterRelayAll().value === false}>
                {t('dashboard.server.chat.block_all_messages', 'Block All Messages')}
              </option>
            </Show>
          </select>
        </SettingRow>
      </AdminPanel>
      <AdminPanel
        title={t('settings.chat_rules', 'Filter rules')}
        description={t(
          'dashboard.server.chat.add_rules',
          'Add specific rules to filter the messages sent from Gmod to Discord.',
        )}
        icon="list"
        type="none"
        actions={
          <Button variant="primary" disabled={!premium() || gmToDscFilters.loading} onClick={addGmToDscFilter}>
            {t('dashboard.server.chat.add_rule', 'Add Rule')}
          </Button>
        }
      >
        <div class="min-w-0 w-full overflow-x-auto">
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
              <TableState
                colSpan={6}
                loading={gmToDscFilters.loading}
                error={!!gmToDscFilters.error}
                empty={!gmToDscFilters.loading && !gmToDscFilters.error && gmToDscFilters().length === 0}
              >
                <For each={gmToDscFilters()}>
                  {(rule) => (
                    <tr>
                      <td>{filterLabel(rule.element)}</td>
                      <td>{filterLabel(rule.operator)}</td>
                      <td>
                        <TextValue value={rule.trigger} />
                      </td>
                      <td>{filterLabel(rule.action)}</td>
                      <td>
                        <div class="flex gap-2 justify-center">
                          {rule.active ? (
                            <Icon name="check" class="text-success" />
                          ) : (
                            <Icon name="x" class="text-error" />
                          )}
                        </div>
                      </td>
                      <td>
                        <div class="flex gap-2 justify-center">
                          <IconButton
                            size="sm"
                            label={t('dashboard.server.chat.edit', 'Edit')}
                            icon="pencil"
                            disabled={ruleSave.pending()}
                            onClick={() => {
                              ruleSave.reset()
                              setSelectFilter({ ...rule })
                              showDialog('edit_rule_modal')
                            }}
                          />
                          <IconButton
                            size="sm"
                            variant="danger"
                            label={t('dashboard.server.chat.delete', 'Delete')}
                            icon="trash-2"
                            disabled={ruleSave.pending()}
                            onClick={() => deleteGmToDscFilter(rule.id)}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </For>
              </TableState>
            </tbody>
          </table>
        </div>
      </AdminPanel>
    </>
  )
}

export default ServerChats
