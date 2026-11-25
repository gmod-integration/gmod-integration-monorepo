import { z } from 'zod'
import { createDocument, type ZodOpenApiOperationObject, type ZodOpenApiResponsesObject } from 'zod-openapi'
import {
  GuildDashboardSettingsRequestSchema,
  GuildDashboardSettingsSchema,
  ServerDashboardSettingsRequestSchema,
  ServerDashboardSettingsSchema,
} from '@gmod/schema/server/DashboardSettingsSchema.js'
import {
  StatusConfigurationSaveSchema,
  StatusConfigurationSaveResponseSchema,
  StatusConfigurationSnapshotSchema,
} from '@gmod/schema/server/StatusConfigurationSchema.js'
import { AccessResponseSchema } from '@gmod/schema/server/AccessPolicySchema.js'
import {
  RewardGrantSchema,
  RewardHistoryQuerySchema,
  RewardHistorySchema,
  RewardManualGrantSchema,
  RewardRuleDeleteSchema,
  RewardRuleInputSchema,
  RewardRuleSaveSchema,
  RewardRuleSchema,
  RewardsDashboardSchema,
  RewardSimulationInputSchema,
  RewardSimulationSchema,
} from '@gmod/schema/server/RewardsSchema.js'
import {
  AccountErasureRequestSchema,
  AccountErasureResponseSchema,
  AccountErasureStatusResponseSchema,
} from '@gmod/schema/user/AccountErasureSchema.js'

import {
  AdminGuildListQuerySchema,
  AdminServerListQuerySchema,
  AdminUserListQuerySchema,
  AdminPremiumListQuerySchema,
  AdminGuildRowSchema,
  AdminServerRowSchema,
  AdminUserRowSchema,
  AdminGuildDetailSchema,
  AdminOverviewSchema,
  AdminServerUpdateSchema,
  AdminServerCommandSchema,
  AdminPremiumUpdateSchema,
  AdminPremiumMutationResultSchema,
  AdminPartnerUpdateSchema,
  AdminPartnerMutationResultSchema,
  AdminRevokeSessionsSchema,
} from '@gmod/schema/admin/AdminDashboardSchema.js'
import { AdminAnalyticsQuerySchema, AdminAnalyticsSchema } from '@gmod/schema/admin/AdminAnalyticsSchema.js'
import {
  AdminConnectionsQuerySchema,
  AdminErrorsQuerySchema,
  AdminBugsQuerySchema,
  AdminConnectionsSchema,
  AdminErrorsSchema,
  AdminBugsSchema,
} from '@gmod/schema/admin/AdminMonitoringSchema.js'
import { AdminPreviewQuerySchema, AdminServerPreviewsSchema } from '@gmod/schema/admin/AdminServerPreviewsSchema.js'
import { StatusMessagePreviewSchema } from '@gmod/schema/server/StatusMessagePreviewSchema.js'
import { ConsoleRconRequestSchema, ConsoleRconResponseSchema } from '@gmod/schema/gmod/ConsoleStreamSchema.js'
import { DashboardAccessDenialReasonSchema } from '@gmod/schema/user/DashboardAccessSchema.js'

const date = z.string().datetime({ offset: true })
const identity = z.string().min(1)
const SessionSnapshotSchema = z.object({
  authenticated: z.literal(true),
  user: z.object({
    id: identity,
    username: z.string(),
    rank: z.string(),
    globalName: z.string(),
    displayName: z.string(),
    avatarURL: z.string(),
    displayAvatarURL: z.string(),
    discriminator: z.string(),
  }),
  session: z.object({
    id: identity,
    expiresAt: date,
    absoluteExpiresAt: date,
    actorDiscordID: identity.optional(),
  }),
  csrfToken: z.string().min(1),
})
const SessionListSchema = z.object({
  sessions: z.array(
    z.object({
      id: identity,
      createdAt: date,
      lastSeenAt: date,
      expiresAt: date,
      absoluteExpiresAt: date,
      os: z.string().nullable(),
      browser: z.string().nullable(),
      ip: z.string().nullable(),
      country: z.string().nullable(),
      isCurrent: z.boolean(),
      actorDiscordID: identity.optional(),
    }),
  ),
})
const ErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    reason: DashboardAccessDenialReasonSchema.optional(),
    capability: z.string().optional(),
    limit: z.number().nullable().optional(),
    used: z.number().optional(),
  }),
})
const ActorRecoverySchema = ErrorSchema.extend({ csrfToken: z.string().min(1) })
const LegacySessionSchema = z.object({ token: z.string().min(1).max(255) }).strict()
const ImpersonationSchema = z.object({ discordID: z.string().regex(/^\d{1,255}$/) }).strict()
const RevocationSchema = z.object({ revoked: z.literal(true) })
const WebSocketTicketSchema = z.object({ ticket: z.string(), expiresAt: date })
const GuildSettingsResponseSchema = z.object({
  settings: GuildDashboardSettingsSchema,
  sync: z.enum(['applied', 'pending']),
})
const ServerSettingsResponseSchema = z.object({
  settings: ServerDashboardSettingsSchema,
  sync: z.enum(['applied', 'pending']),
})

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
const json = (name: string, description: string) => ({
  description,
  content: { 'application/json': { schema: ref(name) } },
})
const errors: ZodOpenApiResponsesObject = {
  400: json('Error', 'Invalid parameters, body or configuration.'),
  401: json('Error', 'The application session is absent, expired or revoked.'),
  403: json(
    'Error',
    'Origin, CSRF, permissions, provider authorization or commercial access denied. Dashboard policy refusals use code dashboard_access_denied with a single reason: discord_admin_required, steam_link_required, game_admin_required or scope_unavailable. Provider authorization errors keep their own code.',
  ),
  404: json('Error', 'The resource was not found within the authorized scope.'),
  503: {
    ...json('Error', 'A required service is temporarily unavailable. This does not revoke the session.'),
    headers: { 'Retry-After': { schema: { type: 'string' }, description: 'Retry delay in seconds, when known.' } },
  },
}
const csrf = {
  name: 'X-CSRF-Token',
  in: 'header' as const,
  required: false,
  description:
    'Required for cookie-authenticated mutations: use csrfToken from GET /auth/session. Explicit application Bearer authentication is exempt. Never send an erasure receipt as an application session.',
  schema: { type: 'string' as const },
}
const pathParameter = (name: string, description: string) => ({
  name,
  in: 'path' as const,
  required: true,
  description,
  schema: { type: 'string' as const, minLength: 1 },
})
const guild = pathParameter(
  'guildID',
  'Discord community ID. Dashboard access requires Discord administrator permission plus a recorded in-game administrator rank on a community server. The Discord owner or buyer of an active GmodStore purchase linked to this community is exempt.',
)
const server = pathParameter(
  'serverID',
  'GMod server ID belonging to the named community. The in-game administrator rank must be enabled in ig_adminRank on this exact server, unless the community owner or linked active buyer exception applies. No player connection is required.',
)
const rewardRule = {
  ...pathParameter('ruleID', 'UUID of a reward rule belonging to this server.'),
  schema: { type: 'string' as const, format: 'uuid' },
}
const rewardExample = {
  name: 'Account linked',
  description: 'Reward the first verified account link.',
  enabled: true,
  trigger: { type: 'verification' },
  actions: [{ type: 'darkrp_money', amount: 5000 }],
  pendingDays: 7,
  startsAt: null,
  endsAt: null,
}
const body = (schema: z.ZodTypeAny, example: Record<string, unknown>) => ({
  required: true,
  content: { 'application/json': { schema, example } },
})
const operation = (
  operationId: string,
  tag: string,
  summary: string,
  schema: string,
  options: Partial<ZodOpenApiOperationObject>,
): ZodOpenApiOperationObject => ({
  operationId,
  tags: [tag],
  summary,
  responses: { 200: json(schema, 'Successful operation.'), ...errors },
  ...options,
})

const adminDescription =
  'Requires an own, non-delegated application session whose account is in the root developer allowlist. Discord community administrator permissions do not grant platform access.'
const adminOperation = (
  id: string,
  summary: string,
  schema: string,
  options: Partial<ZodOpenApiOperationObject> = {},
) =>
  operation(id, 'Administration', summary, schema, {
    ...options,
    description: `${adminDescription} ${options.description || ''}`.trim(),
  })
const adminList = (row: z.ZodTypeAny, query: z.ZodTypeAny) =>
  z.object({ items: z.array(row), total: z.number().int().nonnegative(), query })
const adminPath = (name: string) => pathParameter(name, 'Platform administration target identifier.')

/** Describes the currently mounted v6 HTTP contract without importing databases or runtime workers. */
export function createOpenApiDocument(apiUrl: string) {
  const base = apiUrl.replace(/\/+$/, '')
  const secureCookie = new URL(base).protocol === 'https:'
  const prefix = secureCookie ? '__Host-' : ''

  return createDocument({
    openapi: '3.1.0',
    info: {
      title: 'GMod Integration API v6',
      version: '6.0.0',
      description:
        'The HTTP routes currently available in v6. Authenticate through Discord using the website, then reuse the HttpOnly application cookie. GET /auth/session provides the CSRF token for cookie-authenticated writes. Application sessions and Discord provider grants have independent lifetimes. All v6 responses use Cache-Control: no-store. Business mutations are never automatically replayed. Custom validations, permissions and current commercial capabilities are also enforced by the server. WebSocket messages are described separately by the AsyncAPI document.',
    },
    servers: [{ url: `${base}/v6`, description: 'Configured API service' }],
    tags: [
      { name: 'Service', description: 'Availability and version.' },
      { name: 'Authentication', description: 'Application sessions, recovery, revocation and short-lived tickets.' },
      { name: 'Access', description: 'Authoritative community/server capabilities and usages.' },
      { name: 'Settings', description: 'Atomic dashboard configuration saves.' },
      { name: 'Status', description: 'Versioned status message and button configuration.' },
      { name: 'Console', description: 'Acknowledged server console commands.' },
      { name: 'Rewards', description: 'Server reward rules, eligibility and delivery history.' },
      { name: 'Administration', description: 'Developer-only platform administration and support.' },
      { name: 'Privacy', description: 'Account erasure requests and receipt-scoped recovery.' },
    ],
    security: [{ sessionCookie: [] }, { sessionBearer: [] }],
    paths: {
      '/admin/access': { get: adminOperation('getAdminAccess', 'Verify platform developer access', 'AdminAccess') },
      '/admin/overview': {
        get: adminOperation('getAdminOverview', 'Read platform totals and recent registrations', 'AdminOverview'),
      },
      '/admin/analytics': {
        get: adminOperation('getAdminAnalytics', 'Read UTC registration series', 'AdminAnalytics', {
          requestParams: { query: AdminAnalyticsQuerySchema },
        }),
      },
      '/admin/guilds': {
        get: adminOperation('listAdminGuilds', 'List communities', 'AdminGuildList', {
          requestParams: { query: AdminGuildListQuerySchema },
        }),
      },
      '/admin/servers': {
        get: adminOperation('listAdminServers', 'List servers', 'AdminServerList', {
          requestParams: { query: AdminServerListQuerySchema },
        }),
      },
      '/admin/users': {
        get: adminOperation('listAdminUsers', 'List accounts and live session counts', 'AdminUserList', {
          requestParams: { query: AdminUserListQuerySchema },
        }),
      },
      '/admin/premium': {
        get: adminOperation('listAdminPremium', 'List community Premium grants', 'AdminPremiumList', {
          requestParams: { query: AdminPremiumListQuerySchema },
        }),
      },
      '/admin/guilds/{guildID}': {
        get: adminOperation('getAdminGuild', 'Read community details and access', 'AdminGuildDetail', {
          parameters: [adminPath('guildID')],
        }),
      },
      '/admin/servers/{serverID}': {
        patch: adminOperation('updateAdminServer', 'Update server identity or visibility', 'AdminServer', {
          parameters: [adminPath('serverID'), csrf],
          requestBody: body(AdminServerUpdateSchema, { name: 'Example server', reason: 'Support request confirmed' }),
        }),
        delete: adminOperation('deleteAdminServer', 'Delete a server registration', 'AdminDeleted', {
          parameters: [adminPath('serverID'), csrf],
          requestBody: body(AdminServerCommandSchema, {
            confirm: 'example-server',
            reason: 'Support request confirmed',
          }),
          description: 'Destructive operation. confirm must equal the target serverID. The reason is audited.',
        }),
      },
      '/admin/servers/{serverID}/reset-token': {
        post: adminOperation('resetAdminServerToken', 'Rotate a server credential', 'AdminReset', {
          parameters: [adminPath('serverID'), csrf],
          requestBody: body(AdminServerCommandSchema, {
            confirm: 'example-server',
            reason: 'Credential rotation requested',
          }),
          description:
            'confirm must equal serverID. Invalidates the old server credential and its derived player credentials. Does not return the new secret. The reason is audited.',
        }),
      },
      '/admin/guilds/{guildID}/premium': {
        put: adminOperation('updateAdminPremium', 'Update a manual community Premium grant', 'AdminPremiumMutation', {
          parameters: [adminPath('guildID'), csrf],
          requestBody: body(AdminPremiumUpdateSchema, { enabled: true, reason: 'Support request confirmed' }),
          description:
            'Changes only the manual grant, preserving store entitlements. pending indicates external synchronization is unconfirmed. The reason is audited.',
        }),
      },
      '/admin/guilds/{guildID}/partner': {
        patch: adminOperation('updateAdminPartner', 'Update a community partner badge', 'AdminPartnerMutation', {
          parameters: [adminPath('guildID'), csrf],
          requestBody: body(AdminPartnerUpdateSchema, { enabled: true, reason: 'Partnership approved' }),
          description:
            'Changes only the public partner badge. Premium grants and purchased entitlements are preserved. Requires an own platform-administrator session; the reason is audited.',
        }),
      },
      '/admin/users/{userID}/revoke-sessions': {
        post: adminOperation('revokeAdminUserSessions', 'Revoke an account’s application sessions', 'Revocation', {
          parameters: [adminPath('userID'), csrf],
          requestBody: body(AdminRevokeSessionsSchema, {
            confirm: 'example-user',
            reason: 'Account recovery requested',
          }),
          description:
            'confirm must equal userID. Own-account actions are refused. Revokes sessions for the target and delegations involving it, not its Discord provider grant. The reason is audited.',
        }),
      },
      '/admin/monitoring/connections': {
        get: adminOperation('listAdminConnections', 'Read shared addon presence leases', 'AdminConnections', {
          requestParams: { query: AdminConnectionsQuerySchema },
          description:
            'Presence may be unavailable or remain positive until the 90-second lease expires after a gateway crash.',
        }),
      },
      '/admin/monitoring/errors': {
        get: adminOperation('listAdminErrors', 'Read grouped integration error reports', 'AdminErrors', {
          requestParams: { query: AdminErrorsQuerySchema },
        }),
      },
      '/admin/monitoring/bugs': {
        get: adminOperation('listAdminBugs', 'Read grouped bug reports', 'AdminBugs', {
          requestParams: { query: AdminBugsQuerySchema },
        }),
      },
      '/admin/servers/{serverID}/previews': {
        get: adminOperation(
          'getAdminServerPreviews',
          'Read up to six stored screenshot previews',
          'AdminServerPreviews',
          { parameters: [adminPath('serverID')] },
        ),
      },
      '/admin/servers/{serverID}/status-preview': {
        get: adminOperation(
          'getAdminServerStatusPreview',
          'Render a saved Discord status without publishing it',
          'StatusMessagePreview',
          { parameters: [adminPath('serverID')], requestParams: { query: AdminPreviewQuerySchema } },
        ),
      },
      '/': {
        get: operation('getV6Status', 'Service', 'Read API version', 'ServiceStatus', {
          security: [],
          responses: {
            200: json('ServiceStatus', 'The v6 router is responding.'),
            503: json('Error', 'The service is restarting.'),
          },
        }),
      },
      '/auth/session': {
        get: operation(
          'getApplicationSession',
          'Authentication',
          'Read the current session and CSRF token',
          'Session',
          {
            description:
              'Does not depend on a valid Discord provider grant. A valid actor cookie after delegation expiry returns 401 actor_session_available with a recovery csrfToken; POST /auth/impersonations/end with that token. An ordinary 401 does not include it.',
            responses: {
              200: json(
                'Session',
                'Current application identity, exact session and CSRF token; no durable credential.',
              ),
              ...errors,
              401: {
                description:
                  'No valid session, or actor_session_available with a CSRF token for delegated-session recovery.',
                content: {
                  'application/json': { schema: { anyOf: [ref('Error'), ref('ActorRecovery')] } },
                },
              },
            },
          },
        ),
      },
      '/auth/legacy-session': {
        post: operation(
          'exchangeLegacySession',
          'Authentication',
          'Exchange an existing legacy credential once',
          'Session',
          {
            security: [],
            description:
              'Requires an existing, unexpired and unrevoked legacy credential in a JSON body. Sets the HttpOnly session cookie, rotates the credential and clears the actor cookie. A different authenticated account cannot be replaced; that conflict returns 409. A concurrently consumed credential may return 401; reread /auth/session before treating it as logout.',
            requestBody: body(LegacySessionSchema, { token: 'YOUR_EXISTING_LEGACY_APPLICATION_CREDENTIAL' }),
            responses: {
              200: json('Session', 'Legacy credential exchanged and session cookie set.'),
              ...errors,
              409: json('Error', 'A different account is already signed in.'),
              415: json('Error', 'Use an application/json request body.'),
            },
          },
        ),
      },
      '/auth/logout': {
        post: operation(
          'logoutApplicationSession',
          'Authentication',
          'Revoke the presented session and clear cookies',
          'Revocation',
          {
            security: [],
            parameters: [csrf],
            description:
              'Revokes the exact presented application session and its delegates, not every session for that user. After an expired delegation, the actor cookie can also authorize logout and requires its CSRF proof. Returns success when no credential is presented. Cookie cleanup does not substitute for confirmed server revocation.',
          },
        ),
      },
      '/auth/sessions': {
        get: operation(
          'listApplicationSessions',
          'Authentication',
          'List this account’s active sessions',
          'SessionList',
          {
            description:
              'Requires the original account, not a delegated session. Results contain metadata and isCurrent; no credentials.',
          },
        ),
      },
      '/auth/sessions/{id}': {
        delete: operation(
          'revokeApplicationSession',
          'Authentication',
          'Revoke an owned session and its delegates',
          'Revocation',
          {
            parameters: [
              {
                ...pathParameter('id', 'UUID of an active session owned by the current account.'),
                schema: { type: 'string', format: 'uuid' },
              },
              csrf,
            ],
            description:
              'Delegated sessions cannot manage sessions. Revoking the current session also clears its cookie.',
          },
        ),
      },
      '/auth/ws-ticket': {
        post: operation(
          'issueWebSocketTicket',
          'Authentication',
          'Issue a single-use WebSocket connection ticket',
          'WebSocketTicket',
          {
            parameters: [csrf],
            description:
              'The ticket expires within 30 seconds and never outlives the application session. Connect the dashboard using ?ticket=... once; each reconnect needs a new ticket. The ticket is not an application Bearer credential and should not be stored or logged.',
          },
        ),
      },
      '/auth/impersonations': {
        post: operation(
          'startImpersonation',
          'Authentication',
          'Create a developer delegation to another account',
          'Session',
          {
            parameters: [csrf],
            requestBody: body(ImpersonationSchema, { discordID: '123456789012345678' }),
            description:
              'Requires rank developer on an original session and an existing different target account. Preserves the actor in a separate HttpOnly cookie and issues a delegated session for at most 15 minutes, bounded by the actor session. Logs contain actor/subject/session IDs, never credentials.',
          },
        ),
      },
      '/auth/impersonations/end': {
        post: operation(
          'endImpersonation',
          'Authentication',
          'Return to the actor account, including after delegation expiry',
          'Session',
          {
            security: [{ actorCookie: [] }],
            parameters: [
              {
                ...csrf,
                required: true,
                description:
                  'CSRF token for the active delegate, or the recovery csrfToken from a 401 actor_session_available response. Required even if an Authorization header is supplied.',
              },
            ],
            description:
              'Requires the separate actor cookie. A valid delegate must belong to that actor. Revokes the delegate if it remains valid, restores the actor session cookie and clears the actor cookie. Identity changes require a fresh session check and a fresh WebSocket ticket.',
          },
        ),
      },
      '/guilds/{guildID}/access': {
        get: operation('getGuildAccess', 'Access', 'Read community capabilities and usage', 'Access', {
          parameters: [guild],
        }),
      },
      '/guilds/{guildID}/servers/{serverID}/access': {
        get: operation('getServerAccess', 'Access', 'Read community and server capabilities and usage', 'Access', {
          parameters: [guild, server],
        }),
      },
      '/guilds/{guildID}/settings': {
        put: operation(
          'saveGuildSettings',
          'Settings',
          'Save related community settings atomically',
          'GuildSettingsResponse',
          {
            parameters: [guild, csrf],
            requestBody: body(GuildDashboardSettingsRequestSchema, { settings: { verification_dont_mp: false } }),
            description:
              'Send only changed settings, with at least one key. All values are validated and committed together. A pending external synchronization is separate from a failed database save. Paid options use the community’s effective capabilities; authorized cleanup remains available.',
          },
        ),
      },
      '/guilds/{guildID}/servers/{serverID}/settings': {
        put: operation(
          'saveServerSettings',
          'Settings',
          'Save related server settings atomically',
          'ServerSettingsResponse',
          {
            parameters: [guild, server, csrf],
            requestBody: body(ServerDashboardSettingsRequestSchema, {
              settings: { ig_debug: false, ig_supportLink: 'https://example.com/support' },
            }),
            description:
              'Send only changed settings, with at least one key. Unknown keys, unsupported HTTP/HTTPS support URLs, empty administrator-rank maps and values exceeding 255 serialized characters are rejected. In-game setting updates return sync: pending until external application; queue acceptance is not an addon acknowledgement.',
          },
        ),
      },
      '/guilds/{guildID}/servers/{serverID}/console/commands': {
        post: operation(
          'executeServerConsoleCommand',
          'Console',
          'Submit an acknowledged RCON command',
          'ConsoleRconResponse',
          {
            parameters: [guild, server, csrf],
            requestBody: body(ConsoleRconRequestSchema, {
              requestID: 'f58fc7eb-7d03-4d48-b9d3-e97f745d9ab4',
              command: 'status',
            }),
            description:
              'Requires a valid dashboard session, fresh dashboard permission on this exact server and console.rcon. Dashboard permission requires Discord administrator plus a linked Steam account with a recorded rank enabled in this server’s ig_adminRank; the Discord owner and buyer of an active purchase linked to this community are exceptions. No player connection is required. Authorized delegated sessions use the support actor from the authenticated session; caller-supplied identities are rejected. Commands are one line, at most 8192 UTF-8 bytes, with no NUL/CR/LF. A matching addon acknowledgement confirms console acceptance, not the command’s eventual effect or output. Missing acknowledgements return status unknown and must not be automatically replayed. requestID is reserved across API replicas for ten minutes and bound to the actor, subject account, server and command digest; a matching retry returns the prior outcome, a pending or conflicting request returns 409. Only one command per server can be active. Rate limits are 12 per account/server and 60 per server in a minute. Request logs redact command text.',
            responses: {
              200: json('ConsoleRconResponse', 'Matching addon acceptance, explicit rejection, or uncertain delivery.'),
              ...errors,
              409: json('Error', 'Request pending/conflicting, another command active, or server offline.'),
              429: json('Error', 'The command rate limit has been reached.'),
            },
          },
        ),
      },
      '/guilds/{guildID}/servers/{serverID}/status/configuration': {
        get: operation(
          'getStatusConfiguration',
          'Status',
          'Read the aggregate status configuration and revision',
          'StatusConfigurationSnapshot',
          {
            parameters: [guild, server],
            description:
              'Includes legacy incomplete buttons so the editor can repair them. Write validation is stricter than read validation.',
          },
        ),
        put: operation(
          'saveStatusConfiguration',
          'Status',
          'Save status options and buttons as one versioned configuration',
          'StatusConfigurationSaveResponse',
          {
            parameters: [guild, server, csrf],
            requestBody: body(StatusConfigurationSaveSchema, {
              revision: '0'.repeat(64),
              configuration: {
                settings: {
                  show_player_list_status: true,
                  status_player_list_format: '{name}',
                  show_status_chart: false,
                },
                buttons: [],
              },
            }),
            description:
              'Use the revision from the latest GET. Options and buttons are committed in one transaction. An outdated revision returns 409 conflict; retain the draft and reload the accepted configuration. Repeated button IDs, unowned button IDs, unsafe URLs and capability/quota violations are rejected. sync is not_published when there is no published status, pending when external delivery is unconfirmed, otherwise applied.',
            responses: {
              200: json(
                'StatusConfigurationSaveResponse',
                'Committed configuration, new revision and external synchronization state.',
              ),
              ...errors,
              409: json('Error', 'Configuration changed since this revision. Reload before retrying.'),
            },
          },
        ),
      },
      '/guilds/{guildID}/servers/{serverID}/rewards': {
        get: operation(
          'getRewardsDashboard',
          'Rewards',
          'Read server reward rules and integrations',
          'RewardsDashboard',
          {
            parameters: [guild, server],
            description: 'Requires community administration permission. Query parameters are rejected.',
          },
        ),
      },
      '/guilds/{guildID}/servers/{serverID}/rewards/history': {
        get: operation(
          'getRewardHistory',
          'Rewards',
          'Read paginated server reward delivery history',
          'RewardHistory',
          {
            parameters: [guild, server],
            requestParams: { query: RewardHistoryQuerySchema },
            description:
              'Filter by status, ruleID or steamID64. pageSize accepts 25, 50, 250 or 500; unknown query parameters are rejected.',
          },
        ),
      },
      '/guilds/{guildID}/servers/{serverID}/rewards/rules': {
        post: operation('createRewardRule', 'Rewards', 'Create a server reward rule', 'RewardRule', {
          parameters: [guild, server, csrf],
          requestBody: body(RewardRuleInputSchema, rewardExample),
          description:
            'Requires the effective rewards capability. Actions are configuration, not an immediate delivery. Query parameters are rejected.',
          responses: {
            201: json('RewardRule', 'Created rule and initial revision.'),
            ...errors,
            409: json('Error', 'The operational reward-rule limit was reached.'),
          },
        }),
      },
      '/guilds/{guildID}/servers/{serverID}/rewards/rules/{ruleID}': {
        put: operation('updateRewardRule', 'Rewards', 'Save a reward rule using its current revision', 'RewardRule', {
          parameters: [guild, server, rewardRule, csrf],
          requestBody: body(RewardRuleSaveSchema, { revision: 1, rule: rewardExample }),
          description:
            'An outdated revision returns 409 conflict. Reload before saving again; query parameters are rejected.',
          responses: {
            200: json('RewardRule', 'Saved rule and its incremented revision.'),
            ...errors,
            409: json('Error', 'The rule changed since this revision.'),
          },
        }),
        delete: operation(
          'deleteRewardRule',
          'Rewards',
          'Delete a reward rule using its current revision',
          'RewardRuleDeleted',
          {
            parameters: [guild, server, rewardRule, csrf],
            requestBody: body(RewardRuleDeleteSchema, { revision: 1 }),
            description: 'Requires the current revision in a JSON body. Query parameters are rejected.',
            responses: {
              200: json('RewardRuleDeleted', 'Rule deletion accepted.'),
              ...errors,
              409: json('Error', 'The rule changed since this revision.'),
            },
          },
        ),
      },
      '/guilds/{guildID}/servers/{serverID}/rewards/rules/{ruleID}/simulate': {
        post: operation(
          'simulateReward',
          'Rewards',
          'Check reward eligibility without granting it',
          'RewardSimulation',
          {
            parameters: [guild, server, rewardRule, csrf],
            requestBody: body(RewardSimulationInputSchema, { steamID64: '76561198012345678' }),
            description:
              'Reports eligibility and missing integrations; does not deliver a reward. Query parameters are rejected.',
          },
        ),
      },
      '/guilds/{guildID}/servers/{serverID}/rewards/rules/{ruleID}/grant': {
        post: operation('grantManualReward', 'Rewards', 'Queue an eligible manual reward grant', 'RewardGrant', {
          parameters: [guild, server, rewardRule, csrf],
          requestBody: body(RewardManualGrantSchema, {
            revision: 1,
            steamID64: '76561198012345678',
            reason: 'Tournament winner',
            requestID: '00000000-0000-4000-8000-000000000000',
          }),
          description:
            'Use the current rule revision and a stable UUID requestID for this manual request. A matching request can reuse its grant; a different payload with the same requestID conflicts. 202 acknowledges the grant record, not completed delivery. Inspect history for pending, delivered, failed, uncertain or expired status. Query parameters are rejected.',
          responses: {
            202: json('RewardGrant', 'Grant recorded or matching prior grant returned; delivery may still be pending.'),
            ...errors,
            409: json(
              'Error',
              'Revision/idempotency conflict, unmet eligibility, an unlinked account or a temporarily busy reward.',
            ),
          },
        }),
      },
      '/account/erasure-requests': {
        post: operation(
          'requestAccountErasure',
          'Privacy',
          'Request permanent account erasure',
          'AccountErasureResponse',
          {
            parameters: [csrf],
            requestBody: body(AccountErasureRequestSchema, {
              confirmation: 'DELETE',
              idempotencyKey: '00000000-0000-4000-8000-000000000000',
              receipt: '0'.repeat(64),
            }),
            description:
              'Destructive operation requiring the original account and literal confirmation DELETE. Generate a UUID idempotencyKey and a cryptographically random 64-hex receipt before submitting, and retain both privately. Acceptance revokes account sessions. Recover a lost acknowledgement through the GET receipt endpoint, not by replaying with a revoked session. Matching retries reuse the durable request; conflicting submissions return 409. Query parameters are rejected.',
            responses: {
              200: json('AccountErasureResponse', 'Matching request already completed.'),
              202: json('AccountErasureResponse', 'Request accepted or still in progress.'),
              ...errors,
              409: json('Error', 'Request identity, idempotency key or receipt conflicts with a prior submission.'),
              500: json('Error', 'The request could not be acknowledged.'),
            },
          },
        ),
      },
      '/account/erasure-requests/{requestId}': {
        get: operation(
          'getAccountErasureStatus',
          'Privacy',
          'Read erasure status using its private receipt',
          'AccountErasureStatus',
          {
            security: [{ erasureReceipt: [] }],
            parameters: [
              {
                ...pathParameter('requestId', 'Saved UUID idempotency key of the erasure request.'),
                schema: { type: 'string', format: 'uuid' },
              },
            ],
            description:
              'Authorization: Bearer <receipt> is required; this is not an application session credential. Works after session revocation. A wrong receipt or unknown request returns 404. Receipts in query strings are rejected. Returns neither the receipt nor account identifiers. pending/running/retry are not completion.',
            responses: {
              200: json('AccountErasureStatus', 'Receipt-scoped status without credentials or account identifiers.'),
              ...errors,
              500: json('Error', 'The status could not be acknowledged.'),
            },
          },
        ),
      },
    },
    components: {
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: `${prefix}gmi_session`,
          description:
            'HttpOnly application session established through Discord login. The browser sends it automatically; JavaScript cannot read or set this credential.',
        },
        sessionBearer: {
          type: 'http',
          scheme: 'bearer',
          description:
            'Existing explicit application session credential for non-browser clients. Never use a Discord access token, a WebSocket ticket, a stored SHA-256 digest or an erasure receipt here.',
        },
        actorCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: `${prefix}gmi_actor_session`,
          description:
            'Separate HttpOnly original-actor session, set only by developer delegation. Used to return to that account.',
        },
        erasureReceipt: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: '64 hexadecimal characters',
          description:
            'Private erasure receipt generated before request submission. Independent of application and Discord sessions.',
        },
      },
      schemas: {
        AdminAccess: z.object({ authorized: z.literal(true), discordID: identity }),
        AdminOverview: AdminOverviewSchema,
        AdminAnalytics: AdminAnalyticsSchema,
        AdminGuildList: adminList(AdminGuildRowSchema, AdminGuildListQuerySchema),
        AdminServerList: adminList(AdminServerRowSchema, AdminServerListQuerySchema),
        AdminUserList: adminList(AdminUserRowSchema, AdminUserListQuerySchema),
        AdminPremiumList: adminList(AdminGuildRowSchema, AdminPremiumListQuerySchema),
        AdminGuildDetail: AdminGuildDetailSchema,
        AdminServer: AdminServerRowSchema,
        AdminDeleted: z.object({ deleted: z.literal(true) }),
        AdminReset: z.object({ reset: z.literal(true) }),
        AdminPremiumMutation: AdminPremiumMutationResultSchema,
        AdminPartnerMutation: AdminPartnerMutationResultSchema,
        AdminConnections: AdminConnectionsSchema,
        AdminErrors: AdminErrorsSchema,
        AdminBugs: AdminBugsSchema,
        AdminServerPreviews: AdminServerPreviewsSchema,
        StatusMessagePreview: StatusMessagePreviewSchema,
        ServiceStatus: z.object({ status: z.literal('ok'), version: z.literal('v6') }),
        Error: ErrorSchema,
        ActorRecovery: ActorRecoverySchema,
        Session: SessionSnapshotSchema,
        SessionList: SessionListSchema,
        Revocation: RevocationSchema,
        WebSocketTicket: WebSocketTicketSchema,
        Access: AccessResponseSchema,
        GuildSettingsResponse: GuildSettingsResponseSchema,
        ServerSettingsResponse: ServerSettingsResponseSchema,
        StatusConfigurationSnapshot: StatusConfigurationSnapshotSchema,
        StatusConfigurationSaveResponse: StatusConfigurationSaveResponseSchema,
        ConsoleRconResponse: ConsoleRconResponseSchema,
        RewardsDashboard: RewardsDashboardSchema,
        RewardRule: RewardRuleSchema,
        RewardHistory: RewardHistorySchema,
        RewardSimulation: RewardSimulationSchema,
        RewardGrant: RewardGrantSchema,
        RewardRuleDeleted: z.object({ success: z.literal(true) }),
        AccountErasureResponse: AccountErasureResponseSchema,
        AccountErasureStatus: AccountErasureStatusResponseSchema,
      },
    },
  })
}
