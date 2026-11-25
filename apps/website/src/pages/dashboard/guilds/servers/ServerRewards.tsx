import { useParams } from '@solidjs/router'
import { createEffect, createResource, createSignal, For, Index, on, Show, type Component } from 'solid-js'
import {
  RewardGrantSchema,
  RewardHistorySchema,
  RewardRuleInputSchema,
  RewardRuleSchema,
  RewardsDashboardSchema,
  RewardSimulationSchema,
} from '@gmod/schema/server/RewardsSchema.js'
import DiscordUser from '../../../../components/discord/DiscordUser.js'
import AdminPanel from '../../../../components/AdminPanel.js'
import AdminModal from '../../../../components/AdminModal.js'
import ConfirmActionDialog from '../../../../components/ConfirmActionDialog.js'
import { GuildRolesState, retainGuildRoleSelection } from '../../../../components/GuildRolesState.js'
import { PaginationControls } from '../../../../components/Pagination.js'
import { useFeatureAccess } from '../../../../components/AccessProvider.js'
import { FeatureGate, SuspendedFeature } from '../../../../components/FeatureGate.js'
import {
  AsyncState,
  BooleanStatus,
  Button,
  DateTime,
  FormActions,
  FormField,
  Icon,
  IconButton,
  StatusBadge,
  TableState,
  type StatusTone,
} from '../../../../components/ui/index.js'
import { createAsyncAction } from '../../../../hooks/createAsyncAction.js'
import { createDraftForm, type DraftErrors } from '../../../../hooks/createDraftForm.js'
import { useDraftGuard } from '../../../../hooks/draftRegistry.js'
import { useI18n } from '../../../../i18n.js'
import { fetchAPI } from '../../../../utils/api.js'
import { formatDateTime } from '../../../../utils/dateTime.js'
import { closeDialog, showDialog } from '../../../../utils/dialog.js'
import { guildRoles, guildRolesRefetch } from '../GuildInformations.js'

type RuleInput = ReturnType<typeof RewardRuleInputSchema.parse>
type Rule = ReturnType<typeof RewardRuleSchema.parse>
type Grant = ReturnType<typeof RewardGrantSchema.parse>
type Simulation = ReturnType<typeof RewardSimulationSchema.parse>
type Action = RuleInput['actions'][number]
const EMPTY_RULE = (): RuleInput => ({
  name: '',
  description: '',
  enabled: false,
  trigger: { type: 'verification' },
  actions: [{ type: 'darkrp_money', amount: 5000 }],
  pendingDays: 7,
  startsAt: null,
  endsAt: null,
})
const inputFromRule = (rule: Rule): RuleInput => ({
  name: rule.name,
  description: rule.description,
  enabled: rule.enabled,
  trigger: structuredClone(rule.trigger),
  actions: structuredClone(rule.actions),
  pendingDays: rule.pendingDays,
  startsAt: rule.startsAt,
  endsAt: rule.endsAt,
})
const toLocalDate = (value: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
const fromLocalDate = (value: string) => (value ? new Date(value).toISOString() : null)
const STEAM_ID = /^7656119\d{10}$/

const ServerRewards: Component = () => {
  const params = useParams()
  const { t, locale } = useI18n()
  const access = useFeatureAccess('rewards.rules')
  const base = () =>
    `/v6/guilds/${encodeURIComponent(params.guildID ?? '')}/servers/${encodeURIComponent(params.serverID ?? '')}/rewards`
  const [editing, setEditing] = createSignal<Rule>()
  const [removing, setRemoving] = createSignal<Rule>()
  const [selectedRule, setSelectedRule] = createSignal<Rule>()
  const [steamID64, setSteamID64] = createSignal('')
  const [grantReason, setGrantReason] = createSignal('')
  const [simulation, setSimulation] = createSignal<Simulation>()
  const [recentGrant, setRecentGrant] = createSignal<Grant>()
  const [grantRequest, setGrantRequest] = createSignal<{
    ruleID: string
    revision: number
    steamID64: string
    reason: string
    requestID: string
  }>()
  const [statusFilter, setStatusFilter] = createSignal('')
  const [playerFilter, setPlayerFilter] = createSignal('')
  const [ruleFilter, setRuleFilter] = createSignal('')
  const [historyPage, setHistoryPage] = createSignal(1)
  const [historySize, setHistorySize] = createSignal(25)
  const [conflict, setConflict] = createSignal(false)
  const request = async (endpoint: string, method = 'GET', body?: unknown) => {
    const response = await fetchAPI(endpoint, method, body)
    if (!response.ok) {
      setConflict(response.status === 409)
      throw new Error('Rewards request failed')
    }
    setConflict(false)
    return response.json()
  }
  const [dashboard, { mutate, refetch }] = createResource(base, async (endpoint) =>
    RewardsDashboardSchema.parse(await request(endpoint)),
  )
  const data = () => (!dashboard.error ? dashboard.latest : undefined)
  const rules = () => data()?.rules ?? []
  const available = () => !dashboard.loading && !dashboard.error && !!data()
  const [history, { refetch: refetchHistory }] = createResource(
    () => {
      const query = new URLSearchParams({ page: String(historyPage()), pageSize: String(historySize()) })
      if (statusFilter()) query.set('status', statusFilter())
      if (ruleFilter()) query.set('ruleID', ruleFilter())
      if (STEAM_ID.test(playerFilter())) query.set('steamID64', playerFilter())
      return `${base()}/history?${query}`
    },
    async (endpoint) => RewardHistorySchema.parse(await request(endpoint)),
  )
  const historyData = () => (!history.error ? history.latest : undefined)
  const errorMessage = () =>
    conflict()
      ? t(
          'rewards.conflict',
          'This reward changed. Refresh its configuration before trying again. Your entries have been kept.',
        )
      : t('rewards.request_error', 'Unable to complete this action. Refresh the page and try again.')
  const editor = createDraftForm<RuleInput>({
    initial: EMPTY_RULE(),
    validate: (draft) => {
      const result = RewardRuleInputSchema.safeParse(draft)
      if (result.success) return {}
      return Object.fromEntries(
        result.error.issues.map((issue) => [
          issue.path[0],
          t('rewards.invalid_field', 'Check this field and its allowed values.'),
        ]),
      ) as DraftErrors<RuleInput>
    },
    errorMessage,
  })
  const simulationAction = createAsyncAction({ errorMessage })
  const cleanupAction = createAsyncAction({ errorMessage })
  useDraftGuard({
    dirty: () => !!selectedRule() && !!grantReason(),
    pending: simulationAction.pending,
    discard: () => setGrantReason(''),
  })
  const canEdit = () => access.allowed() && available() && !editor.pending()
  const canSave = () => {
    if (!available() || !editor.valid()) return false
    if (access.allowed()) return true
    const saved = editing()
    return (
      !!saved &&
      !editor.draft().enabled &&
      JSON.stringify({ ...editor.draft(), enabled: saved.enabled }) === JSON.stringify(inputFromRule(saved))
    )
  }
  const triggerLabel = (trigger: RuleInput['trigger']) => {
    switch (trigger.type) {
      case 'verification':
        return t('rewards.trigger_verification', 'Account verification')
      case 'vote':
        return t('rewards.trigger_vote', 'Validated vote')
      case 'playtime':
        return t(
          'rewards.trigger_playtime_value',
          '{1} hours played',
          (trigger.seconds / 3600).toLocaleString(locale()),
        )
      case 'manual':
        return t('rewards.trigger_manual', 'Manual attribution')
    }
  }
  const actionLabel = (action: Action | Grant['actions'][number]) => {
    if (action.type === 'lua') return t('rewards.lua', 'Execute Lua')
    if (action.type === 'discord_role')
      return t(
        'rewards.action_role_value',
        'Discord role: {1}',
        !guildRoles.error
          ? (guildRoles()?.find((role) => role.id === action.roleID)?.name ?? action.roleID ?? '')
          : (action.roleID ?? ''),
      )
    const amount = (action.amount ?? 0).toLocaleString(locale())
    if (action.type === 'darkrp_money') return t('rewards.action_money_value', '{1} DarkRP money', amount)
    if (action.type === 'pointshop_points') return t('rewards.action_pointshop_value', '{1} Pointshop points', amount)
    return t('rewards.action_pointshop2_value', '{1} Pointshop 2 points', amount)
  }
  const statusLabel = (status: Grant['status']) =>
    ({
      pending: t('rewards.status_pending', 'Pending'),
      delivered: t('rewards.status_delivered', 'Delivered'),
      failed: t('rewards.status_failed', 'Failed'),
      uncertain: t('rewards.status_uncertain', 'Needs review'),
      expired: t('rewards.status_expired', 'Expired'),
    })[status]
  const statusTone = (status: Grant['status']): StatusTone =>
    status === 'delivered' ? 'success' : status === 'failed' ? 'danger' : status === 'uncertain' ? 'warning' : 'neutral'
  const reasonLabel = (reason: string | null) => {
    switch (reason) {
      case 'already_received':
        return t('rewards.reason_already_received', 'This player has already received this reward.')
      case 'account_not_linked':
      case 'not_linked':
      case 'unlinked':
        return t('rewards.reason_not_linked', 'The player must link their Steam and Discord accounts.')
      case 'entitlement_unavailable':
        return t('access.unavailable', 'Access could not be verified. Your saved configuration is preserved.')
      case 'playtime_required':
      case 'insufficient_playtime':
        return t('rewards.reason_playtime', 'The required playtime has not been reached.')
      case 'rule_disabled':
      case 'disabled':
        return t('rewards.reason_disabled', 'This rule is disabled.')
      case 'outside_period':
      case 'not_started':
      case 'ended':
        return t('rewards.reason_period', 'This reward is outside its active period.')
      case 'cooldown':
        return t('rewards.reason_cooldown', 'The delay before another reward has not elapsed.')
      case 'vote_required':
      case 'no_vote':
        return t('rewards.reason_vote', 'A validated vote is required.')
      case 'missing_integration':
      case 'integration_unavailable':
        return t('rewards.reason_integration', 'A required addon is unavailable.')
      case 'player_offline':
        return t('rewards.reason_offline', 'Waiting for the player to connect to the game server.')
      case 'identity_changed':
        return t('rewards.reason_identity', 'The linked account changed before delivery.')
      case 'provider_unavailable':
      case 'queue_expired':
      case 'discord_unavailable':
        return t('rewards.reason_discord_unavailable', 'Discord is temporarily unavailable.')
      case 'discord_forbidden':
      case 'role_not_manageable':
      case 'role_unavailable':
        return t(
          'rewards.reason_role_unavailable',
          'The bot cannot assign this Discord role. Check the role and its permissions.',
        )
      case 'journal_unavailable':
        return t(
          'rewards.reason_journal',
          'The game server could not save the delivery record. No new reward was applied.',
        )
      case 'execution_failed':
        return t('rewards.reason_execution', 'The game integration reported a failed attribution.')
      case 'lua_compile_failed':
        return t(
          'rewards.reason_lua_compile',
          'The Lua script could not compile. Check its syntax in the reward editor.',
        )
      case 'lua_execution_failed':
        return t(
          'rewards.reason_lua_execution',
          'The Lua script stopped with an error. Check the game server before taking further action.',
        )
      case 'lua_unavailable':
        return t('rewards.reason_lua_unavailable', 'Lua execution is unavailable on the game server.')
      case 'expired':
        return t('rewards.reason_expired', 'The delivery deadline has passed.')
      case 'uncertain':
      case 'execution_uncertain':
        return t(
          'rewards.reason_uncertain',
          'The result could not be confirmed. Check the game server before taking further action.',
        )
      case null:
        return ''
      default:
        return t(
          'rewards.reason_other',
          'The condition or delivery could not be confirmed. Check the player and server integration.',
        )
    }
  }
  const playtimeHours = () => {
    const trigger = editor.draft().trigger
    return trigger.type === 'playtime' ? trigger.seconds / 3600 : ''
  }
  const voteHours = () => {
    const trigger = editor.draft().trigger
    return trigger.type === 'vote' ? trigger.cooldownSeconds / 3600 : ''
  }
  const actionRole = (action: Action) => (action.type === 'discord_role' ? action.roleID : '')
  const actionAmount = (action: Action) =>
    action.type === 'discord_role' || action.type === 'lua' ? '' : action.amount
  const actionCode = (action: Action) => (action.type === 'lua' ? action.code : '')
  function begin(rule?: Rule, template?: 'verification' | 'vote' | 'playtime') {
    if (!available() || editor.pending() || (!rule && !access.allowed())) return
    setEditing(rule)
    const draft = rule ? inputFromRule(rule) : EMPTY_RULE()
    if (template) {
      draft.trigger =
        template === 'playtime'
          ? { type: 'playtime', seconds: 18_000 }
          : template === 'vote'
            ? { type: 'vote', cooldownSeconds: 10_800 }
            : { type: 'verification' }
      draft.name =
        template === 'verification'
          ? t('rewards.template_welcome', 'Welcome gift')
          : template === 'vote'
            ? t('rewards.template_vote', 'Thanks for your vote')
            : t('rewards.template_playtime', 'First 5 hours')
    }
    editor.reset(rule ? draft : EMPTY_RULE())
    if (!rule && template) editor.setDraft(draft)
    showDialog('rewards-editor')
  }
  async function save() {
    if (!canSave()) return
    const target = editing()
    const endpoint = base()
    const accepted = await editor.save(async (draft) => {
      const input = RewardRuleInputSchema.parse(draft)
      const saved = RewardRuleSchema.parse(
        await request(
          target ? `${endpoint}/rules/${target.id}` : `${endpoint}/rules`,
          target ? 'PUT' : 'POST',
          target ? { revision: target.revision, rule: input } : input,
        ),
      )
      if (endpoint === base())
        mutate((previous) =>
          previous
            ? {
                ...previous,
                rules: target
                  ? previous.rules.map((rule) => (rule.id === saved.id ? saved : rule))
                  : [...previous.rules, saved],
              }
            : previous,
        )
      return inputFromRule(saved)
    })
    if (accepted) closeDialog('rewards-editor')
  }
  function updateAction(index: number, action: Action) {
    editor.patch({ actions: editor.draft().actions.map((current, at) => (at === index ? action : current)) })
  }
  function inspect(rule: Rule) {
    setSelectedRule(rule)
    setSteamID64('')
    setGrantReason('')
    setSimulation(undefined)
    setRecentGrant(undefined)
    simulationAction.reset()
    showDialog('rewards-player')
  }
  async function simulate() {
    const rule = selectedRule()
    if (!rule || !STEAM_ID.test(steamID64())) return
    const target = steamID64()
    setSimulation(undefined)
    await simulationAction.run(async () => {
      const result = RewardSimulationSchema.parse(
        await request(`${base()}/rules/${rule.id}/simulate`, 'POST', { steamID64: target }),
      )
      if (target === steamID64() && rule.id === selectedRule()?.id) setSimulation(result)
    })
  }
  createEffect(
    on(
      base,
      () => {
        setHistoryPage(1)
        setSelectedRule(undefined)
        editor.discard()
        for (const id of ['rewards-editor', 'rewards-player', 'rewards-delete', 'rewards-grant']) closeDialog(id)
        void guildRolesRefetch()
      },
      { defer: true },
    ),
  )

  return (
    <div class="flex min-w-0 flex-col gap-6">
      <AdminPanel
        title={t('rewards.title', 'Player rewards')}
        description={t(
          'rewards.description',
          'Reward account verification, validated votes and playtime milestones. Gifts are delivered automatically and tracked individually.',
        )}
        icon="gift"
        actions={
          <Button
            size="sm"
            variant="ghost"
            disabled={dashboard.loading}
            onClick={() => {
              void refetch()
              void refetchHistory()
            }}
          >
            <Icon name="refresh-cw" size={15} />
            {t('ui.refresh', 'Refresh')}
          </Button>
        }
      >
        <FeatureGate
          capability="rewards.rules"
          loading={dashboard.loading}
          error={dashboard.error}
          used={rules().length}
        />
        <SuspendedFeature capability="rewards.rules" active={rules().some((rule) => rule.enabled)} />
        <p class="text-sm text-base-content/65">
          {t(
            'rewards.delivery_note',
            'Offline players keep pending gifts until their delivery deadline. An uncertain result is never automatically granted again.',
          )}
        </p>
      </AdminPanel>

      <AdminPanel
        title={t('rewards.rules', 'Rules')}
        type="none"
        actions={
          <Button variant="primary" size="sm" disabled={!available() || !access.allowed()} onClick={() => begin()}>
            <Icon name="plus" size={15} />
            {t('rewards.add_rule', 'Add reward')}
          </Button>
        }
      >
        <div class="flex flex-wrap items-center gap-2 p-4">
          <span class="text-sm text-base-content/65">{t('rewards.templates', 'Start from a template:')}</span>
          <For each={['verification', 'vote', 'playtime'] as const}>
            {(template) => (
              <Button
                size="sm"
                variant="ghost"
                disabled={!available() || !access.allowed()}
                onClick={() => begin(undefined, template)}
              >
                {template === 'verification'
                  ? t('rewards.template_welcome', 'Welcome gift')
                  : template === 'vote'
                    ? t('rewards.template_vote', 'Thanks for your vote')
                    : t('rewards.template_playtime', 'First 5 hours')}
              </Button>
            )}
          </For>
        </div>
        <div class="min-w-0 overflow-x-auto">
          <table class="table">
            <thead>
              <tr>
                <th>{t('rewards.rule', 'Reward')}</th>
                <th>{t('rewards.trigger', 'Trigger')}</th>
                <th>{t('rewards.contents', 'Contents')}</th>
                <th>{t('ui.status', 'Status')}</th>
                <th>{t('ui.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                loading={dashboard.loading}
                error={dashboard.error}
                empty={!rules().length}
                colSpan={5}
                onRetry={() => void refetch()}
              >
                <For each={rules()}>
                  {(rule) => (
                    <tr>
                      <td>
                        <strong>{rule.name}</strong>
                        <Show when={rule.description}>
                          <p class="max-w-xs whitespace-normal text-xs text-base-content/65">{rule.description}</p>
                        </Show>
                        <p class="mt-1 text-xs text-base-content/65">
                          {t(
                            'rewards.pending_days_value',
                            'Delivery expires after {1} days',
                            rule.pendingDays.toLocaleString(locale()),
                          )}
                        </p>
                      </td>
                      <td>{triggerLabel(rule.trigger)}</td>
                      <td>
                        <ul class="flex flex-col gap-1">
                          <For each={rule.actions}>{(action) => <li>{actionLabel(action)}</li>}</For>
                        </ul>
                      </td>
                      <td>
                        <BooleanStatus value={rule.enabled} />
                      </td>
                      <td>
                        <div class="flex flex-wrap gap-1">
                          <IconButton
                            icon="pencil"
                            size="sm"
                            label={t('rewards.edit_rule', 'Edit reward')}
                            onClick={() => begin(rule)}
                          />
                          <IconButton
                            icon="flask-conical"
                            size="sm"
                            label={t('rewards.inspect_player', 'Check player eligibility')}
                            onClick={() => inspect(rule)}
                          />
                          <Show when={rule.enabled && !access.allowed()}>
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={cleanupAction.pending()}
                              onClick={() =>
                                void cleanupAction.run(async () => {
                                  await request(`${base()}/rules/${rule.id}`, 'PUT', {
                                    revision: rule.revision,
                                    rule: { ...inputFromRule(rule), enabled: false },
                                  })
                                  await refetch()
                                })
                              }
                            >
                              {t('ui.disable', 'Disable')}
                            </Button>
                          </Show>
                          <IconButton
                            icon="trash-2"
                            size="sm"
                            label={t('rewards.delete_rule', 'Delete reward')}
                            onClick={() => {
                              setRemoving(rule)
                              showDialog('rewards-delete')
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
        </div>
        <Show when={cleanupAction.error()}>
          <p role="alert" class="p-4 text-sm text-error">
            {cleanupAction.error()}
          </p>
        </Show>
      </AdminPanel>

      <AdminPanel
        title={t('rewards.history', 'History')}
        type="none"
        footer={
          <Show when={!history.loading && !history.error && historyData()}>
            <PaginationControls
              page={historyPage()}
              pages={Math.max(1, Math.ceil((historyData()?.total ?? 0) / historySize()))}
              previousDisabled={historyPage() <= 1}
              nextDisabled={historyPage() * historySize() >= (historyData()?.total ?? 0)}
              onPrevious={() => setHistoryPage((page) => Math.max(1, page - 1))}
              onNext={() => setHistoryPage((page) => page + 1)}
              onFirst={() => setHistoryPage(1)}
              limit={historySize()}
              limits={[25, 50, 250, 500]}
              onLimitChange={(size) => {
                setHistorySize(size)
                setHistoryPage(1)
              }}
            />
          </Show>
        }
      >
        <div class="flex flex-wrap gap-4 p-4">
          <FormField id="rewards-history-status" label={t('ui.status', 'Status')}>
            <select
              id="rewards-history-status"
              class="select select-sm"
              value={statusFilter()}
              onChange={(event) => {
                setStatusFilter(event.currentTarget.value)
                setHistoryPage(1)
              }}
            >
              <option value="">{t('rewards.all_statuses', 'All statuses')}</option>
              <For each={['pending', 'delivered', 'failed', 'uncertain', 'expired'] as const}>
                {(status) => <option value={status}>{statusLabel(status)}</option>}
              </For>
            </select>
          </FormField>
          <FormField id="rewards-history-rule" label={t('rewards.rule', 'Reward')}>
            <select
              id="rewards-history-rule"
              class="select select-sm"
              value={ruleFilter()}
              onChange={(event) => {
                setRuleFilter(event.currentTarget.value)
                setHistoryPage(1)
              }}
            >
              <option value="">{t('rewards.all_rules', 'All rewards')}</option>
              <For each={rules()}>{(rule) => <option value={rule.id}>{rule.name}</option>}</For>
            </select>
          </FormField>
          <FormField
            id="rewards-history-player"
            label={t('rewards.steam_id', 'Steam ID64')}
            description={t('rewards.steam_filter_help', 'Enter the complete 17-digit Steam ID to filter.')}
          >
            <input
              id="rewards-history-player"
              class="input input-sm"
              inputmode="numeric"
              value={playerFilter()}
              maxLength={17}
              onInput={(event) => {
                setPlayerFilter(event.currentTarget.value.trim())
                setHistoryPage(1)
              }}
            />
          </FormField>
        </div>
        <div class="min-w-0 overflow-x-auto">
          <table class="table">
            <thead>
              <tr>
                <th>{t('rewards.created', 'Created')}</th>
                <th>{t('rewards.rule', 'Reward')}</th>
                <th>{t('rewards.player', 'Player')}</th>
                <th>{t('ui.status', 'Status')}</th>
                <th>{t('rewards.delivery', 'Delivery details')}</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                loading={history.loading}
                error={history.error}
                empty={!historyData()?.items.length}
                colSpan={5}
                onRetry={() => void refetchHistory()}
              >
                <For each={historyData()?.items ?? []}>
                  {(grant) => (
                    <tr>
                      <td class="whitespace-nowrap">
                        <DateTime value={grant.createdAt} />
                      </td>
                      <td>
                        {grant.ruleName}
                        <Show when={grant.actorDiscordID}>
                          {(actor) => (
                            <p class="mt-1 text-xs text-base-content/65">
                              {t('rewards.author', 'Attributed by')} <DiscordUser user={{ id: actor() }} />
                            </p>
                          )}
                        </Show>
                        <Show when={grant.reason}>
                          <p class="mt-1 max-w-xs whitespace-normal text-xs text-base-content/65">{grant.reason}</p>
                        </Show>
                      </td>
                      <td>
                        <code>{grant.steamID64}</code>
                      </td>
                      <td>
                        <StatusBadge tone={statusTone(grant.status)}>{statusLabel(grant.status)}</StatusBadge>
                        <p class="mt-1 text-xs text-base-content/65">
                          {t('rewards.deadline', 'Deadline: {1}', formatDateTime(grant.expiresAt, locale()))}
                        </p>
                      </td>
                      <td>
                        <ul class="flex flex-col gap-2">
                          <For each={grant.actions}>
                            {(action) => (
                              <li class="min-w-48">
                                <div class="flex flex-wrap items-center gap-2">
                                  <span>{actionLabel(action)}</span>
                                  <StatusBadge size="sm" tone={statusTone(action.status)}>
                                    {statusLabel(action.status)}
                                  </StatusBadge>
                                </div>
                                <Show when={action.reason}>
                                  <p class="max-w-sm whitespace-normal text-xs text-base-content/65">
                                    {reasonLabel(action.reason)}
                                  </p>
                                </Show>
                              </li>
                            )}
                          </For>
                        </ul>
                      </td>
                    </tr>
                  )}
                </For>
              </TableState>
            </tbody>
          </table>
        </div>
      </AdminPanel>

      <AdminPanel
        title={t('rewards.integrations', 'Integrations')}
        description={t(
          'rewards.integrations_help',
          'The game server reports compatible addons. A stale or missing report does not confirm availability.',
        )}
      >
        <AsyncState loading={dashboard.loading} error={dashboard.error} onRetry={() => void refetch()}>
          <Show
            when={data()?.integrations}
            fallback={
              <p class="text-sm text-base-content/65">
                {t(
                  'rewards.no_report',
                  'No integration report yet. Connect the updated Gmod Integration addon to this server.',
                )}
              </p>
            }
          >
            <p class="text-sm text-base-content/65">
              {t(
                'rewards.last_report',
                'Last report: {1}',
                data()?.integrations ? formatDateTime(data()!.integrations!.updatedAt, locale()) : '',
              )}
            </p>
          </Show>
          <dl class="flex flex-col gap-4">
            <For
              each={
                [
                  ['darkrp', 'DarkRP'],
                  ['pointshop', 'Pointshop'],
                  ['pointshop2', 'Pointshop 2'],
                ] as const
              }
            >
              {([key, label]) => (
                <div class="flex flex-wrap items-center justify-between gap-3 border-b border-base-200 pb-4">
                  <dt class="ui-value-label">{label}</dt>
                  <dd>
                    <BooleanStatus
                      value={
                        data()?.integrations && Date.now() - Date.parse(data()!.integrations!.updatedAt) < 5 * 60_000
                          ? data()!.integrations![key]
                          : undefined
                      }
                      trueLabel={t('rewards.detected', 'Detected')}
                      falseLabel={t('rewards.not_detected', 'Not detected')}
                    />
                  </dd>
                </div>
              )}
            </For>
          </dl>
          <p class="text-sm text-base-content/65">
            {t(
              'rewards.discord_role_help',
              'Discord roles require a linked account and a role the bot is allowed to assign. Permissions are checked again at delivery.',
            )}
          </p>
        </AsyncState>
      </AdminPanel>

      <AdminModal
        id="rewards-editor"
        size="wide"
        title={editing() ? t('rewards.edit_rule', 'Edit reward') : t('rewards.add_rule', 'Add reward')}
        busy={editor.pending()}
        onClose={editor.discard}
        onCancel={editor.discard}
      >
        <div class="grid min-w-0 gap-4 md:grid-cols-2">
          <FormField id="rewards-name" label={t('rewards.name', 'Name')} error={editor.errors().name}>
            <input
              id="rewards-name"
              class="input w-full"
              maxLength={80}
              value={editor.draft().name}
              disabled={!canEdit()}
              onInput={(event) => editor.patch({ name: event.currentTarget.value })}
            />
          </FormField>
          <FormField id="rewards-trigger" label={t('rewards.trigger', 'Trigger')}>
            <select
              id="rewards-trigger"
              class="select w-full"
              value={editor.draft().trigger.type}
              disabled={!canEdit()}
              onChange={(event) => {
                const type = event.currentTarget.value
                editor.patch({
                  trigger:
                    type === 'playtime'
                      ? { type, seconds: 18_000 }
                      : type === 'vote'
                        ? { type, cooldownSeconds: 10_800 }
                        : { type: type as 'verification' | 'manual' },
                })
              }}
            >
              <option value="verification">{t('rewards.trigger_verification', 'Account verification')}</option>
              <option value="vote">{t('rewards.trigger_vote', 'Validated vote')}</option>
              <option value="playtime">{t('rewards.trigger_playtime', 'Playtime milestone')}</option>
              <option value="manual">{t('rewards.trigger_manual', 'Manual attribution')}</option>
            </select>
          </FormField>
          <FormField id="rewards-description" label={t('rewards.description_label', 'Description')}>
            <textarea
              id="rewards-description"
              class="textarea w-full"
              maxLength={500}
              value={editor.draft().description}
              disabled={!canEdit()}
              onInput={(event) => editor.patch({ description: event.currentTarget.value })}
            />
          </FormField>
          <div class="flex flex-col gap-4">
            <Show when={editor.draft().trigger.type === 'playtime'}>
              <FormField
                id="rewards-hours"
                label={t('rewards.hours', 'Required playtime in hours')}
                error={editor.errors().trigger}
              >
                <input
                  id="rewards-hours"
                  type="number"
                  class="input w-full"
                  min="0.01"
                  step="0.01"
                  value={playtimeHours()}
                  disabled={!canEdit()}
                  onInput={(event) =>
                    editor.patch({
                      trigger: { type: 'playtime', seconds: Math.round(Number(event.currentTarget.value) * 3600) },
                    })
                  }
                />
              </FormField>
            </Show>
            <Show when={editor.draft().trigger.type === 'vote'}>
              <FormField
                id="rewards-cooldown"
                label={t('rewards.cooldown', 'Minimum reward interval in hours')}
                description={t(
                  'rewards.vote_help',
                  'Only validated votes count. The server vote cooldown still applies.',
                )}
                error={editor.errors().trigger}
              >
                <input
                  id="rewards-cooldown"
                  type="number"
                  class="input w-full"
                  min="3"
                  step="1"
                  value={voteHours()}
                  disabled={!canEdit()}
                  onInput={(event) =>
                    editor.patch({
                      trigger: { type: 'vote', cooldownSeconds: Math.round(Number(event.currentTarget.value) * 3600) },
                    })
                  }
                />
              </FormField>
            </Show>
            <FormField id="rewards-enabled" label={t('ui.enabled', 'Enabled')}>
              <input
                id="rewards-enabled"
                type="checkbox"
                class="toggle toggle-sm"
                checked={editor.draft().enabled}
                disabled={editor.pending() || (!access.allowed() && !editor.draft().enabled)}
                onChange={(event) => editor.patch({ enabled: event.currentTarget.checked })}
              />
            </FormField>
          </div>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h3 class="font-semibold">{t('rewards.contents', 'Contents')}</h3>
          <Button
            size="sm"
            variant="ghost"
            disabled={!canEdit() || editor.draft().actions.length >= 5}
            onClick={() =>
              editor.patch({ actions: [...editor.draft().actions, { type: 'darkrp_money', amount: 5000 }] })
            }
          >
            <Icon name="plus" size={15} />
            {t('rewards.add_action', 'Add item')}
          </Button>
        </div>
        <Show when={editor.errors().actions}>
          <p role="alert" class="text-sm text-error">
            {editor.errors().actions}
          </p>
        </Show>
        <Index each={editor.draft().actions}>
          {(action, index) => (
            <div class="grid min-w-0 items-end gap-3 rounded-lg border border-base-200 p-3 md:grid-cols-[1fr_1fr_auto]">
              <div class="min-w-0" classList={{ 'md:col-span-2': action().type === 'lua' }}>
                <FormField id={`reward-action-${index}`} label={t('rewards.action_type', 'Reward type')}>
                  <select
                    id={`reward-action-${index}`}
                    class="select w-full"
                    value={action().type}
                    disabled={!canEdit()}
                    onChange={(event) => {
                      const type = event.currentTarget.value
                      updateAction(
                        index,
                        type === 'discord_role'
                          ? { type, roleID: '' }
                          : type === 'lua'
                            ? { type, code: '' }
                            : { type: type as 'darkrp_money' | 'pointshop_points' | 'pointshop2_points', amount: 5000 },
                      )
                    }}
                  >
                    <option value="darkrp_money">{t('rewards.darkrp_money', 'DarkRP money')}</option>
                    <option value="pointshop_points">{t('rewards.pointshop_points', 'Pointshop points')}</option>
                    <option value="pointshop2_points">{t('rewards.pointshop2_points', 'Pointshop 2 points')}</option>
                    <option value="discord_role">{t('rewards.discord_role', 'Discord role')}</option>
                    <option value="lua">{t('rewards.lua', 'Execute Lua')}</option>
                  </select>
                </FormField>
              </div>
              <Show when={action().type !== 'lua'}>
                <Show
                  when={action().type === 'discord_role'}
                  fallback={
                    <FormField id={`reward-amount-${index}`} label={t('rewards.amount', 'Amount')}>
                      <input
                        id={`reward-amount-${index}`}
                        type="number"
                        class="input w-full"
                        min="1"
                        max="1000000"
                        step="1"
                        value={actionAmount(action())}
                        disabled={!canEdit()}
                        onInput={(event) => {
                          const current = action()
                          if (current.type !== 'discord_role' && current.type !== 'lua')
                            updateAction(index, { type: current.type, amount: Number(event.currentTarget.value) })
                        }}
                      />
                    </FormField>
                  }
                >
                  <div class="min-w-0">
                    <GuildRolesState />
                    <FormField id={`reward-role-${index}`} label={t('rewards.discord_role', 'Discord role')}>
                      <select
                        ref={(select) => retainGuildRoleSelection(select, () => actionRole(action()))}
                        id={`reward-role-${index}`}
                        class="select w-full"
                        value={actionRole(action())}
                        disabled={!canEdit() || guildRoles.loading || !!guildRoles.error}
                        onChange={(event) =>
                          updateAction(index, { type: 'discord_role', roleID: event.currentTarget.value })
                        }
                      >
                        <option value="">{t('rewards.choose_role', 'Choose a role')}</option>
                        <Show
                          when={
                            action().type === 'discord_role' &&
                            !!actionRole(action()) &&
                            !guildRoles()?.some((role) => role.id === actionRole(action()))
                          }
                        >
                          <option value={actionRole(action())}>{actionRole(action())}</option>
                        </Show>
                        <For each={!guildRoles.error ? guildRoles() : []}>
                          {(role) => <option value={role.id}>{role.name}</option>}
                        </For>
                      </select>
                    </FormField>
                  </div>
                </Show>
              </Show>
              <IconButton
                icon="trash-2"
                label={t('rewards.remove_action', 'Remove item')}
                disabled={!canEdit() || editor.draft().actions.length <= 1}
                onClick={() => editor.patch({ actions: editor.draft().actions.filter((_, at) => at !== index) })}
              />
              <Show when={action().type === 'lua'}>
                <div class="min-w-0 md:col-span-3">
                  <FormField
                    id={`reward-code-${index}`}
                    label={t('rewards.lua_code', 'Server Lua code')}
                    description={t(
                      'rewards.lua_help',
                      'Runs on the game server for the rewarded player. Available variables: ply, steamID64 and reward (id, actionID, name, steamID64). Maximum 16,384 characters.',
                    )}
                  >
                    <textarea
                      id={`reward-code-${index}`}
                      class="textarea w-full font-mono text-sm"
                      rows={9}
                      maxLength={16_384}
                      spellcheck={false}
                      autocapitalize="off"
                      aria-describedby={`reward-code-${index}-description`}
                      placeholder={'ply:ChatPrint("Reward received!")'}
                      value={actionCode(action())}
                      disabled={!canEdit()}
                      onInput={(event) => updateAction(index, { type: 'lua', code: event.currentTarget.value })}
                    />
                  </FormField>
                </div>
              </Show>
            </div>
          )}
        </Index>
        <div class="grid min-w-0 gap-4 md:grid-cols-2">
          <FormField
            id="rewards-pending-days"
            label={t('rewards.pending_days', 'Offline delivery deadline in days')}
            error={editor.errors().pendingDays}
          >
            <input
              id="rewards-pending-days"
              type="number"
              class="input w-full"
              min="1"
              max="30"
              value={editor.draft().pendingDays}
              disabled={!canEdit()}
              onInput={(event) => editor.patch({ pendingDays: Number(event.currentTarget.value) })}
            />
          </FormField>
          <div />
          <FormField
            id="rewards-start"
            label={t('rewards.starts_at', 'Starts at (optional)')}
            error={editor.errors().startsAt}
          >
            <input
              id="rewards-start"
              type="datetime-local"
              class="input w-full"
              value={toLocalDate(editor.draft().startsAt)}
              disabled={!canEdit()}
              onChange={(event) => editor.patch({ startsAt: fromLocalDate(event.currentTarget.value) })}
            />
          </FormField>
          <FormField id="rewards-end" label={t('rewards.ends_at', 'Ends at (optional)')} error={editor.errors().endsAt}>
            <input
              id="rewards-end"
              type="datetime-local"
              class="input w-full"
              value={toLocalDate(editor.draft().endsAt)}
              disabled={!canEdit()}
              onChange={(event) => editor.patch({ endsAt: fromLocalDate(event.currentTarget.value) })}
            />
          </FormField>
        </div>
        <FeatureGate capability="rewards.rules" showQuota={false} />
        <FormActions
          dirty={editor.dirty()}
          pending={editor.pending()}
          disabled={!canSave()}
          error={editor.error()}
          saveLabel={editing() ? t('ui.save', 'Save') : t('ui.create', 'Create')}
          onSave={() => void save()}
          onCancel={() => {
            editor.discard()
            closeDialog('rewards-editor')
          }}
        />
      </AdminModal>

      <AdminModal
        id="rewards-player"
        title={t('rewards.inspect_player', 'Check player eligibility')}
        description={selectedRule()?.name}
        busy={simulationAction.pending()}
        onClose={() => {
          setSelectedRule(undefined)
          setGrantReason('')
        }}
        onCancel={() => {
          setSelectedRule(undefined)
          setGrantReason('')
        }}
      >
        <FormField id="rewards-player-steam" label={t('rewards.steam_id', 'Steam ID64')}>
          <input
            id="rewards-player-steam"
            class="input w-full"
            inputmode="numeric"
            maxLength={17}
            value={steamID64()}
            disabled={simulationAction.pending()}
            onInput={(event) => {
              setSteamID64(event.currentTarget.value.trim())
              setSimulation(undefined)
              setRecentGrant(undefined)
            }}
          />
        </FormField>
        <Button
          size="sm"
          variant="secondary"
          disabled={!STEAM_ID.test(steamID64())}
          loading={simulationAction.pending()}
          onClick={() => void simulate()}
        >
          {t('rewards.simulate', 'Simulate without granting')}
        </Button>
        <Show when={simulationAction.error()}>
          <p role="alert" class="text-sm text-error">
            {simulationAction.error()}
          </p>
        </Show>
        <Show when={simulation()}>
          {(result) => (
            <div role="status" class="flex flex-col gap-2 text-sm">
              <StatusBadge tone={result().eligible ? 'success' : 'neutral'}>
                {result().eligible ? t('rewards.eligible', 'Eligible') : t('rewards.not_eligible', 'Not eligible')}
              </StatusBadge>
              <p>{reasonLabel(result().reason)}</p>
              <Show when={result().requiredSeconds !== null}>
                <p>
                  {t(
                    'rewards.progress',
                    '{1} / {2} hours played',
                    (result().playedSeconds / 3600).toLocaleString(locale(), { maximumFractionDigits: 1 }),
                    ((result().requiredSeconds ?? 0) / 3600).toLocaleString(locale(), { maximumFractionDigits: 1 }),
                  )}
                </p>
              </Show>
              <Show when={result().missingIntegrations.length}>
                <p>
                  {t(
                    'rewards.missing_integrations',
                    'Missing integrations: {1}',
                    result().missingIntegrations.join(', '),
                  )}
                </p>
              </Show>
            </div>
          )}
        </Show>
        <FormField
          id="rewards-grant-reason"
          label={t('rewards.manual_reason', 'Reason for manual attribution')}
          description={t(
            'rewards.manual_help',
            'Manual gifts are recorded separately. Review the player and reward before confirming.',
          )}
        >
          <textarea
            id="rewards-grant-reason"
            class="textarea w-full"
            maxLength={500}
            value={grantReason()}
            onInput={(event) => setGrantReason(event.currentTarget.value)}
          />
        </FormField>
        <Button
          variant="primary"
          disabled={!access.allowed() || !STEAM_ID.test(steamID64()) || !grantReason().trim()}
          onClick={() => {
            const rule = selectedRule()
            if (!rule) return
            const previous = grantRequest()
            const sameRequest =
              previous?.ruleID === rule.id &&
              previous.revision === rule.revision &&
              previous.steamID64 === steamID64() &&
              previous.reason === grantReason().trim()
            if (!sameRequest)
              setGrantRequest({
                ruleID: rule.id,
                revision: rule.revision,
                steamID64: steamID64(),
                reason: grantReason().trim(),
                requestID: crypto.randomUUID(),
              })
            showDialog('rewards-grant')
          }}
        >
          {t('rewards.grant', 'Grant reward')}
        </Button>
        <Show when={recentGrant()}>
          <p role="status" class="text-sm text-success">
            {t('rewards.grant_recorded', 'Attribution recorded. Its delivery status is available in History.')}
          </p>
        </Show>
      </AdminModal>

      <ConfirmActionDialog
        id="rewards-delete"
        title={t('rewards.delete_rule', 'Delete reward')}
        description={
          removing()
            ? t(
                'rewards.delete_help',
                'Delete “{1}” and stop future attributions. Previously delivered gifts and history are kept.',
                removing()!.name,
              )
            : ''
        }
        confirmLabel={t('ui.delete', 'Delete')}
        onConfirm={async () => {
          const rule = removing()
          if (!rule) throw new Error('Missing rule')
          await request(`${base()}/rules/${rule.id}`, 'DELETE', { revision: rule.revision })
          mutate((previous) =>
            previous ? { ...previous, rules: previous.rules.filter((row) => row.id !== rule.id) } : previous,
          )
        }}
      />
      <ConfirmActionDialog
        id="rewards-grant"
        title={t('rewards.confirm_grant', 'Confirm manual attribution')}
        description={t(
          'rewards.confirm_grant_help',
          'Grant “{1}” to Steam account {2}. This applies the listed reward actions, including any server Lua script.',
          selectedRule()?.name ?? '',
          grantRequest()?.steamID64 ?? '',
        )}
        confirmLabel={t('rewards.grant', 'Grant reward')}
        variant="primary"
        disabled={!access.allowed()}
        children={
          <div class="flex flex-col gap-3">
            <ul class="flex flex-col gap-2">
              <For each={selectedRule()?.actions ?? []}>{(action) => <li>{actionLabel(action)}</li>}</For>
            </ul>
            <Show when={conflict()}>
              <p role="note" class="text-sm text-warning">
                {errorMessage()}
              </p>
            </Show>
          </div>
        }
        onConfirm={async () => {
          const value = grantRequest()
          if (!value) throw new Error('Missing attribution')
          const { ruleID, ...body } = value
          const result = RewardGrantSchema.parse(await request(`${base()}/rules/${ruleID}/grant`, 'POST', body))
          setRecentGrant(result)
          setGrantRequest(undefined)
          setGrantReason('')
          await refetchHistory()
        }}
      />
    </div>
  )
}

export default ServerRewards
