import Pagination from '../../../../../components/Pagination.js'
import { createListPagination } from '../../../../../hooks/createListPagination.js'
import { type Component, createResource, createSignal, For, Show } from 'solid-js'
import AdminPanel from '../../../../../components/AdminPanel.js'
import { useI18n } from '../../../../../i18n.js'
import { ColorsLogsType } from './ColorLogsType.js'
import AdminModal from '../../../../../components/AdminModal.js'
import { ChannelSelector } from '../../../../../components/AdminChannelSelector.js'
import { fetchAPI } from '../../../../../utils/api.js'
import { useFeatureAccess } from '../../../../../components/AccessProvider.js'
import { FeatureGate, SuspendedFeature } from '../../../../../components/FeatureGate.js'
import { TextValue } from '../../../../../components/popup/TextValue.js'
import {
  Button,
  FormActions,
  FormField,
  IconButton,
  TableState,
  TemplateVariables,
} from '../../../../../components/ui/index.js'
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
  const featureAccess = useFeatureAccess('logs.triggers')

  async function fetchLogTriggers() {
    const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/logs/triggers', 'GET')
    if (!res.ok) {
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
  const playerVariablePath = () =>
    editedTrigger().log_type === 'dark_rp_picked_up_cheque' ? 'data.playerChequeTarget' : 'data.player'
  const eventVariables = () => [
    {
      token: `{{${playerVariablePath()}.steamID64}}`,
      label: t('dashboard.server.logs_trigger.steamID64', 'SteamID64'),
      format: t('ui.template_variables.text', 'Text'),
      example: '76500000000000000',
    },
    {
      token: `{{${playerVariablePath()}.name}}`,
      label: t('dashboard.server.logs_trigger.name', 'Name'),
      format: t('ui.template_variables.text', 'Text'),
      example: 'John Doe',
    },
    {
      token: `{{${playerVariablePath()}.team.name}}`,
      label: t('dashboard.server.logs_trigger.team', 'Team'),
      format: t('ui.template_variables.text', 'Text'),
      example: 'Citizen',
    },
    {
      token: '{{data.amount}}',
      label: t('dashboard.server.logs_trigger.amount', 'Amount'),
      format: t('ui.template_variables.number', 'Number'),
      example: '1000',
    },
  ]
  const unavailable = () => logTriggers.loading || !!logTriggers.error || form.pending() || !featureAccess.allowed()
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
      if (creating) pagination.onChange({ ...pagination.query(), offset: pagination.total() - 1 })
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

  const pagination = createListPagination<log_trigger>(() => (!logTriggers.error ? logTriggers() : undefined))

  return (
    <>
      <AdminModal
        title={
          (editedTrigger().id !== 0 && t('dashboard.server.logs_trigger.edit_trigger', 'Edit Trigger')) ||
          t('dashboard.server.logs_trigger.add_trigger', 'Add Trigger')
        }
        id="edit_log_trigger"
        description={t(
          'dashboard.server.logs_trigger.editor_help',
          'Choose an event and a condition, then write the Discord message to send when it matches. Save to apply the rule.',
        )}
        busy={form.pending()}
        onClose={discard}
        onCancel={discard}
      >
        <FormField
          id="log-trigger-type"
          label={t('dashboard.server.logs_trigger.trigger', 'Event')}
          description={t(
            'dashboard.server.logs_trigger.event_help',
            'Choose the server event to watch. The corresponding gamemode or addon must send this event.',
          )}
        >
          <select
            id="log-trigger-type"
            aria-describedby="log-trigger-type-description"
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
        <FormField
          id="log-trigger-compare"
          label={t('dashboard.server.logs_trigger.compare', 'Event field')}
          description={t('dashboard.server.logs_trigger.compare_help', 'Choose the event value to compare.')}
        >
          <select
            id="log-trigger-compare"
            aria-describedby="log-trigger-compare-description"
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
        <FormField
          id="log-trigger-operator"
          label={t('dashboard.server.logs_trigger.operator', 'Condition')}
          description={t(
            'dashboard.server.logs_trigger.operator_help',
            'Amounts are numbers. Use greater than, less than, equal or not equal. Text conditions do not apply to these amounts.',
          )}
        >
          <select
            id="log-trigger-operator"
            aria-describedby="log-trigger-operator-description"
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
          description={t(
            'dashboard.server.logs_trigger.value_help',
            'Enter the amount to compare against, for example 1000000. Use digits without currency symbols or separators.',
          )}
          error={form.dirty() ? form.errors().value : undefined}
        >
          <input
            id="log-trigger-value"
            type="text"
            maxLength={255}
            aria-invalid={form.dirty() && !!form.errors().value}
            aria-describedby={`log-trigger-value-description${form.dirty() && form.errors().value ? ' log-trigger-value-error' : ''}`}
            placeholder={t('dashboard.server.logs_trigger.value', 'Value')}
            disabled={unavailable()}
            class="input"
            value={editedTrigger().value}
            onInput={(e) => form.patch({ value: e.currentTarget.value })}
          />
        </FormField>
        <FormField
          id="log-trigger-action"
          label={t('dashboard.server.logs_trigger.reply_action', 'Action when matched')}
        >
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
              <span>{t('dashboard.server.logs_trigger.channel', 'Discord destination')}</span>
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
              <span>{t('dashboard.server.logs_trigger.message', 'Message')}</span>
            </label>
            <textarea
              id="log-trigger-message"
              maxLength={255}
              aria-invalid={form.dirty() && !!form.errors().message}
              aria-describedby={`log-trigger-message-description${form.dirty() && form.errors().message ? ' log-trigger-message-error' : ''}`}
              class="textarea"
              placeholder={t('dashboard.server.logs_trigger.message', 'Message')}
              disabled={unavailable()}
              value={editedTrigger().message}
              onInput={(e) => form.patch({ message: e.currentTarget.value })}
            />
            <p id="log-trigger-message-description" class="text-sm text-base-content/65">
              {t(
                'dashboard.server.logs_trigger.message_help',
                'Write the notification sent to the selected Discord channel. Maximum 255 characters, including variables.',
              )}
            </p>
            <Show when={form.dirty() && form.errors().message}>
              <p id="log-trigger-message-error" class="text-sm text-error">
                {form.errors().message}
              </p>
            </Show>
            <TemplateVariables
              variables={eventVariables()}
              syntax="{{data.path.to.var}}"
              description={t(
                'dashboard.server.logs_trigger.message_show_vars_description',
                'Insert event values with {{data.path.to.var}}. Available fields depend on the event; these player fields apply when the event includes a player.',
              )}
              example={{
                template: `{{${playerVariablePath()}.name}} — {{data.amount}}`,
                result: 'John Doe — 1000',
              }}
              formatting={[
                { token: '**text**', label: t('ui.template_variables.bold', 'Bold') },
                { token: '`text`', label: t('ui.template_variables.inline_code', 'Inline code') },
                { token: '__text__', label: t('ui.template_variables.underline', 'Underline') },
                { token: '~~text~~', label: t('ui.template_variables.strikethrough', 'Strikethrough') },
              ]}
            />
          </div>
        </Show>
        <FeatureGate
          capability="logs.triggers"
          loading={logTriggers.loading}
          error={logTriggers.error}
          showQuota={false}
        />
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
        title={t('dashboard.server.logs_trigger.title.logs_channel', 'Log alerts')}
        description={t(
          'dashboard.server.logs_trigger.description.logs_channel',
          'Send a Discord notification when a server event matches a condition, such as a money drop above a chosen amount.',
        )}
        type="none"
        footer={
          !logTriggers.loading && !logTriggers.error && pagination.visible() ? (
            <Pagination
              standalone
              query={pagination.query()}
              total={pagination.total()}
              onChange={pagination.onChange}
            />
          ) : undefined
        }
      >
        <SuspendedFeature
          capability="logs.triggers"
          active={!logTriggers.loading && !logTriggers.error && logTriggers().length > 0}
        />
        <table class="table border-b border-base-300 rounded-none">
          <thead>
            <tr class="text-l">
              <th class="w-1/6">{t('dashboard.server.logs_trigger.trigger', 'Event')}</th>
              <th class="w-1/6">{t('dashboard.server.logs_trigger.compare', 'Event field')}</th>
              <th class="w-1/6">{t('dashboard.server.logs_trigger.operator', 'Condition')}</th>
              <th class="w-1/6">{t('dashboard.server.logs_trigger.value', 'Value')}</th>
              <th class="w-1/6">{t('dashboard.server.logs_trigger.reply_action', 'Action when matched')}</th>
              <th class="text-center">{t('dashboard.server.logs_trigger.action', 'Action')}</th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={6}
              loading={logTriggers.loading}
              error={!!logTriggers.error}
              errorLabel={t('dashboard.server.logs_trigger.load_error', 'Unable to load log alerts. Try again.')}
              emptyLabel={t(
                'dashboard.server.logs_trigger.empty',
                'No log alerts are configured. Add a rule to receive notifications for matching events.',
              )}
              empty={!logTriggers.loading && !logTriggers.error && logTriggers().length === 0}
              onRetry={() => void refetch()}
            >
              <For each={pagination.items()}>
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
                          disabled={logTriggers.loading || !!logTriggers.error || form.pending()}
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
          <FeatureGate
            capability="logs.triggers"
            loading={logTriggers.loading}
            error={logTriggers.error}
            showQuota={false}
          >
            <Button
              disabled={unavailable()}
              onClick={() => {
                discard()
                showDialog('edit_log_trigger')
              }}
            >
              {t('dashboard.server.logs_trigger.addTrigger', 'Add Trigger')}
            </Button>
          </FeatureGate>
        </div>
      </AdminPanel>
    </>
  )
}
