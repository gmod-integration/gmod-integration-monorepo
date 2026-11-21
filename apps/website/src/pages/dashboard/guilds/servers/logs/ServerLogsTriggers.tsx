import { type Component, createResource, createSignal, For, Show } from 'solid-js'
import AdminPanel from '../../../../../components/AdminPanel.js'
import { useI18n } from '../../../../../i18n.js'
import { ColorsLogsType } from './ColorLogsType.js'
import AdminModal from '../../../../../components/AdminModal.js'
import { ChannelSelector } from '../../../../../components/AdminChannelSelector.js'
import { fetchAPI } from '../../../../../utils/api.js'
import { premium } from '../../../../../utils/premium.js'
import { TextValue } from '../../../../../components/popup/TextValue.js'
import { Button, FormActions, FormField, IconButton, TableState } from '../../../../../components/ui/index.js'
import { createDraftForm } from '../../../../../hooks/createDraftForm.js'
import ConfirmActionDialog from '../../../../../components/ConfirmActionDialog.js'
import { closeDialog, showDialog } from '../../../../../utils/dialog.js'

const log_trigger_operator: Record<string, string> = {
  greaterThan: 'greaterThan',
  lessThan: 'lessThan',
  equal: 'equal',
  notEqual: 'notEqual',
  contain: 'contain',
  notContain: 'notContain',
  startWith: 'startWith',
  endWith: 'endWith',
}

const log_trigger_action: Record<string, string> = {
  sendMessageInChannel: 'sendMessageInChannel',
  // sendMessageInDMToAdmins,
}

interface log_trigger_compare {
  [key: string]: {
    type: string
    id: string
  }
}

const log_trigger_compare: Record<string, log_trigger_compare> = {
  dark_rp_drop_money: {
    amount: {
      type: 'number',
      id: 'amount',
    },
  },
  dark_rp_picked_up_money: {
    amount: {
      type: 'number',
      id: 'amount',
    },
  },
  dark_rp_picked_up_cheque: {
    amount: {
      type: 'number',
      id: 'amount',
    },
  },
  ch_atm_send_money: {
    amount: {
      type: 'number',
      id: 'amount',
    },
  },
  ch_atm_receive_money: {
    amount: {
      type: 'number',
      id: 'amount',
    },
  },
  ch_atm_take_money: {
    amount: {
      type: 'number',
      id: 'amount',
    },
  },
  ch_atm_withdraw_money: {
    amount: {
      type: 'number',
      id: 'amount',
    },
  },
  ch_atm_deposit_money: {
    amount: {
      type: 'number',
      id: 'amount',
    },
  },
}

interface log_trigger {
  id: number
  log_type: string
  value: string
  compare: string
  operator: string
  action: string
  channelID: string
  adminIDS: string[]
  message: string
  createdAt: Date
  updatedAt: Date
}

const exampleLogTriggers: log_trigger = {
  id: 0,
  log_type: 'dark_rp_drop_money',
  value: '1000000',
  operator: log_trigger_operator.greaterThan,
  compare: log_trigger_compare.dark_rp_drop_money.amount.id,
  action: log_trigger_action.sendMessageInChannel,
  channelID: '',
  adminIDS: [],
  message:
    'A lot of money ({{data.amount}}) has been dropped by {{data.player.name}} ({{data.player.steamID64}}) on the ground, you should investigate.',
  createdAt: new Date(),
  updatedAt: new Date(),
}

export const ServerLogsTriggers: Component = () => {
  const { t } = useI18n()

  async function fetchLogTriggers() {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/logs/triggers', 'GET')
    if (res.status === 403) {
      return [] as log_trigger[]
    } else if (!res.ok) {
      throw new Error('An error occurred while fetching the log triggers.')
    }
    return (await res.json()) as log_trigger[]
  }

  const [logTriggers, { mutate: mutateLogTrigger, refetch }] = createResource('log-triggers', fetchLogTriggers, {
    initialValue: [] as log_trigger[],
  })

  const freshTrigger = () => ({ ...exampleLogTriggers, adminIDS: [...exampleLogTriggers.adminIDS] })
  const [deleting, setDeleting] = createSignal<log_trigger>()
  const form = createDraftForm<log_trigger>({
    initial: freshTrigger(),
    errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.'),
    validate: (draft) => {
      const errors: Partial<Record<keyof log_trigger, string>> = {}
      const invalid = t('ui.invalid_value', 'Check the entered values.')
      if (!log_trigger_compare[draft.log_type]) errors.log_type = invalid
      if (!log_trigger_compare[draft.log_type]?.[draft.compare]) errors.compare = invalid
      if (!log_trigger_operator[draft.operator]) errors.operator = invalid
      if (!log_trigger_action[draft.action]) errors.action = invalid
      if (
        !draft.value.trim() ||
        draft.value.length > 255 ||
        (['greaterThan', 'lessThan', 'equal', 'notEqual'].includes(draft.operator) &&
          !Number.isFinite(Number(draft.value)))
      )
        errors.value = invalid
      if (!draft.channelID || draft.channelID === '0' || draft.channelID.length > 255) errors.channelID = invalid
      if (!draft.message.trim() || draft.message.length > 255) errors.message = invalid
      return errors
    },
  })
  const editedTrigger = form.draft
  const unavailable = () => logTriggers.loading || !!logTriggers.error || form.pending() || !premium()
  function discard() {
    if (form.pending()) return
    form.reset(freshTrigger())
  }
  async function persistTrigger() {
    if (unavailable()) return
    const saved = await form.save(async (draft) => {
      const creating = draft.id === 0
      const response = await fetchAPI(
        `/users/:discordID/guilds/:guildID/servers/:serverID/logs/triggers${creating ? '' : `/${draft.id}`}`,
        creating ? 'POST' : 'PUT',
        draft,
      )
      if (!response.ok) throw new Error('Unable to save the log trigger.')
      const accepted = (await response.json()) as log_trigger
      mutateLogTrigger((previous) =>
        creating ? [...previous, accepted] : previous.map((row) => (row.id === accepted.id ? accepted : row)),
      )
      return accepted
    })
    if (saved) {
      closeDialog('edit_log_trigger')
      discard()
    }
  }

  async function deleteTrigger(id: number) {
    const res = await fetchAPI(`/users/:discordID/guilds/:guildID/servers/:serverID/logs/triggers/${id}`, 'DELETE')
    if (!res.ok) throw new Error('An error occurred while deleting the trigger.')
    const data = ((await res.json()) as log_trigger).id
    mutateLogTrigger((prev) => prev.filter((row) => row.id !== data))
  }

  return (
    <>
      <AdminModal
        title={
          (editedTrigger().id !== 0 && t('dashboard.server.logs_trigger.edit_trigger', 'Edit Trigger')) ||
          t('dashboard.server.logs_trigger.add_trigger', 'Add Trigger')
        }
        id="edit_log_trigger"
        busy={form.pending()}
        onClose={discard}
        onCancel={discard}
      >
        <FormField id="log-trigger-type" label={t('dashboard.server.logs_trigger.trigger', 'Trigger')}>
          <select
            id="log-trigger-type"
            class="select"
            disabled={unavailable()}
            value={editedTrigger().log_type}
            onChange={(e) => {
              const log_type = e.currentTarget.value
              form.patch({ log_type, compare: Object.keys(log_trigger_compare[log_type])[0] })
            }}
          >
            <For each={Object.keys(log_trigger_compare)}>
              {(trigger) => <option value={trigger}>{t(`dashboard.server.logs.logNames.${trigger}`, trigger)}</option>}
            </For>
          </select>
        </FormField>
        <FormField id="log-trigger-compare" label={t('dashboard.server.logs_trigger.compare', 'Compare')}>
          <select
            id="log-trigger-compare"
            class="select"
            disabled={unavailable()}
            value={editedTrigger().compare}
            onChange={(e) => form.patch({ compare: e.currentTarget.value })}
          >
            <For each={Object.keys(log_trigger_compare[editedTrigger().log_type] ?? {})}>
              {(compare) => (
                <option value={compare}>
                  {t(
                    `dashboard.server.logs_trigger.compare_list.${log_trigger_compare[editedTrigger().log_type][compare].id}`,
                    log_trigger_compare[editedTrigger().log_type][compare].id,
                  )}
                </option>
              )}
            </For>
          </select>
        </FormField>
        <FormField id="log-trigger-operator" label={t('dashboard.server.logs_trigger.operator', 'Operator')}>
          <select
            id="log-trigger-operator"
            class="select"
            disabled={unavailable()}
            onChange={(e) => {
              form.patch({ operator: e.currentTarget.value })
            }}
          >
            <For each={Object.keys(log_trigger_operator)}>
              {(operator) => (
                <option value={operator} selected={editedTrigger().operator === operator}>
                  {t(
                    `dashboard.server.logs_trigger.operator_list.${log_trigger_operator[operator]}`,
                    log_trigger_operator[operator],
                  )}
                </option>
              )}
            </For>
          </select>
        </FormField>
        <FormField
          id="log-trigger-value"
          label={t('dashboard.server.logs_trigger.value', 'Value')}
          error={form.dirty() ? form.errors().value : undefined}
        >
          <input
            id="log-trigger-value"
            type="text"
            maxLength={255}
            aria-invalid={form.dirty() && !!form.errors().value}
            aria-describedby={form.dirty() && form.errors().value ? 'log-trigger-value-error' : undefined}
            placeholder={t('dashboard.server.logs_trigger.value', 'Value')}
            disabled={unavailable()}
            class="input"
            value={editedTrigger().value}
            onInput={(e) => form.patch({ value: e.currentTarget.value })}
          />
        </FormField>
        <FormField id="log-trigger-action" label={t('dashboard.server.logs_trigger.reply_action', 'Reply Action')}>
          <select
            id="log-trigger-action"
            class="select"
            disabled={unavailable()}
            value={editedTrigger().action}
            onChange={(event) => form.patch({ action: event.currentTarget.value })}
          >
            <For each={Object.keys(log_trigger_action)}>
              {(action) => (
                <option value={action} selected={editedTrigger().action === action}>
                  {t(`dashboard.server.logs_trigger.${log_trigger_action[action]}`, log_trigger_action[action])}
                </option>
              )}
            </For>
          </select>
        </FormField>
        <Show when={editedTrigger().action === log_trigger_action.sendMessageInChannel}>
          <div class="fieldset">
            <label class="label">
              <span>{t('dashboard.server.logs_trigger.channel', 'Channel')}</span>
            </label>
            <ChannelSelector
              disabled={unavailable()}
              idSelect={editedTrigger().channelID}
              callback={(channelID) => {
                form.patch({ channelID })
              }}
            />
          </div>
          <div class="fieldset">
            <label class="label" for="log-trigger-message">
              <span>
                {t('dashboard.server.logs_trigger.message', 'Message')}{' '}
                <details class="dropdown dropdown-top dropdown-right">
                  <summary class="link">({t('dashboard.server.logs_trigger.message_show_vars', 'Show Vars')})</summary>
                  <div class="flex flex-col menu dropdown-content bg-base-100 rounded-box z-1 w-80 gap-2 p-2 shadow-2xl border border-base-200">
                    {/*add a description for ply var: you can use custom var with {{data.ply.steamID64}} for example */}
                    <p class="text-base-content/50">
                      {t(
                        'dashboard.server.logs_trigger.message_show_vars_description',
                        'You can use any var of the log by using {{data.path.to.var}}, here is a list of the vars you can use',
                        ['{{data.path.to.var}}'],
                      )}
                      :
                    </p>
                    <ul class="flex flex-col text-sm text-base-content/50">
                      <li>
                        {'{{data.ply.steamID64}}'} : {t('dashboard.server.logs_trigger.steamID64', 'SteamID64')}
                      </li>
                      <li>
                        {'{{data.ply.name}}'} : {t('dashboard.server.logs_trigger.name', 'Name')}
                      </li>
                      <li>
                        {'{{data.ply.team.name}}'} : {t('dashboard.server.logs_trigger.team', 'Team')}
                      </li>
                      <li>
                        {'{{data.amount}}'} : {t('dashboard.server.logs_trigger.amount', 'Amount')}
                      </li>
                      <li>
                        {'{{data.category}}'} : {t('dashboard.server.logs_trigger.category', 'Category')}
                      </li>
                      <li>...</li>
                    </ul>
                  </div>
                </details>
              </span>
            </label>
            <textarea
              id="log-trigger-message"
              maxLength={255}
              aria-invalid={form.dirty() && !!form.errors().message}
              aria-describedby={form.dirty() && form.errors().message ? 'log-trigger-message-error' : undefined}
              class="textarea"
              placeholder={t('dashboard.server.logs_trigger.message', 'Message')}
              disabled={unavailable()}
              value={editedTrigger().message}
              onInput={(e) => form.patch({ message: e.currentTarget.value })}
            />
            <Show when={form.dirty() && form.errors().message}>
              <p id="log-trigger-message-error" class="text-sm text-error">
                {form.errors().message}
              </p>
            </Show>
          </div>
        </Show>
        <FormActions
          pending={form.pending()}
          dirty={form.dirty()}
          disabled={unavailable() || !form.valid()}
          error={form.error()}
          saveLabel={
            editedTrigger().id !== 0
              ? t('dashboard.server.logs_trigger.save', 'Save')
              : t('dashboard.server.logs_trigger.add', 'Add')
          }
          onSave={() => void persistTrigger()}
          onCancel={() => {
            closeDialog('edit_log_trigger')
            discard()
          }}
        />
      </AdminModal>

      <ConfirmActionDialog
        id="delete-log-trigger"
        title={t('editing.delete_trigger', 'Delete trigger?')}
        description={`${deleting() ? `${t(`dashboard.server.logs.logNames.${deleting()!.log_type}`, deleting()!.log_type)} (${deleting()!.value}). ` : ''}${t(
          'editing.delete_trigger_help',
          'The selected event action will stop running. This cannot be undone.',
        )}`}
        confirmLabel={t('dashboard.server.pseudo.delete', 'Delete')}
        onConfirm={async () => {
          const trigger = deleting()
          if (!trigger) throw new Error('No trigger selected')
          await deleteTrigger(trigger.id)
        }}
        onSuccess={() => setDeleting(undefined)}
      />

      <AdminPanel
        title={t('dashboard.server.logs_trigger.title.logs_channel', 'Logs Trigger')}
        description={t(
          'dashboard.server.logs_trigger.description.logs_channel',
          'Define custom actions for specific events in your server. You can customize the actions to suit your needs.',
        )}
        type="none"
        premium={true}
      >
        <table class="table border-b border-base-300 rounded-none">
          <thead>
            <tr class="text-l">
              <th class="w-1/6">{t('dashboard.server.logs_trigger.trigger', 'Trigger')}</th>
              <th class="w-1/6">{t('dashboard.server.logs_trigger.compare', 'Compare')}</th>
              <th class="w-1/6">{t('dashboard.server.logs_trigger.operator', 'Operator')}</th>
              <th class="w-1/6">{t('dashboard.server.logs_trigger.value', 'Value')}</th>
              <th class="w-1/6">{t('dashboard.server.logs_trigger.reply_action', 'Reply Action')}</th>
              <th class="text-center">{t('dashboard.server.logs_trigger.action', 'Action')}</th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={6}
              loading={logTriggers.loading}
              error={!!logTriggers.error}
              empty={!logTriggers.loading && !logTriggers.error && logTriggers().length === 0}
              onRetry={() => void refetch()}
            >
              <For each={logTriggers()}>
                {(trigger) => (
                  <tr>
                    <ColorsLogsType category={trigger.log_type} />
                    <td class="w-1/6 text-nowrap">
                      {t(`dashboard.server.logs_trigger.compare_list.${trigger.compare}`, trigger.compare)}
                    </td>
                    <td class="w-1/6 text-nowrap">
                      {t(
                        `dashboard.server.logs_trigger.operator_list.${log_trigger_operator[trigger.operator]}`,
                        log_trigger_operator[trigger.operator],
                      )}
                    </td>
                    <td class="w-1/6 text-nowrap">
                      <TextValue value={trigger.value} />
                    </td>
                    <td class="w-1/6 text-nowrap">
                      {t(
                        `dashboard.server.logs_trigger.${log_trigger_action[trigger.action]}`,
                        log_trigger_action[trigger.action],
                      )}
                    </td>
                    <td class="w-1/6">
                      <div class="flex gap-2 justify-center">
                        <IconButton
                          size="sm"
                          label={t('dashboard.server.logs_trigger.edit', 'Edit')}
                          icon="pencil"
                          disabled={unavailable()}
                          onClick={() => {
                            form.reset({ ...trigger, adminIDS: [...trigger.adminIDS] })
                            showDialog('edit_log_trigger')
                          }}
                        />
                        <IconButton
                          size="sm"
                          variant="danger"
                          label={t('dashboard.server.pseudo.delete', 'Delete')}
                          icon="trash-2"
                          disabled={unavailable()}
                          onClick={() => {
                            setDeleting(trigger)
                            showDialog('delete-log-trigger')
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </TableState>
          </tbody>
        </table>

        <div class="flex gap-4 p-4">
          <Button
            disabled={unavailable()}
            onClick={() => {
              discard()
              showDialog('edit_log_trigger')
            }}
          >
            {t('dashboard.server.logs_trigger.addTrigger', 'Add Trigger')}
          </Button>
        </div>
      </AdminPanel>
    </>
  )
}
