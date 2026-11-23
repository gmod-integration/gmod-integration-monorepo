type Schema = Record<string, unknown>
type Client = 'dashboard' | 'addon'
type Direction = 'client-to-server' | 'server-to-client'

const serverID = '00000000-0000-4000-8000-000000000001'
const steamID64 = '00000000000000000'
const identifier: Schema = { type: 'string', minLength: 1 }
const steamIdentifier: Schema = { type: 'string', pattern: '^[0-9]{17}$' }

function envelope(kind: 'action' | 'method', name: string, properties: Record<string, Schema>): Schema {
  return {
    type: 'object',
    required: [kind, ...Object.keys(properties)],
    properties: { [kind]: { type: 'string', const: name }, ...properties },
    additionalProperties: true,
  }
}

function message(
  name: string,
  title: string,
  summary: string,
  schema: string,
  client: Client,
  direction: Direction,
  example: Record<string, unknown>,
) {
  return {
    name,
    title,
    summary,
    contentType: 'application/json',
    payload: { $ref: `#/components/schemas/${schema}` },
    examples: [{ name: 'example', payload: example }],
    'x-client': client,
    'x-direction': direction,
  }
}

/** Documents the gateway's current wire protocol, from the gateway's point of view. */
export function createAsyncApiDocument(wsUrl: string, apiUrl: string) {
  const websocket = new URL(wsUrl)
  const api = new URL(apiUrl)
  if (!['ws:', 'wss:'].includes(websocket.protocol)) throw new TypeError('Expected a ws:// or wss:// gateway URL')
  if (!['http:', 'https:'].includes(api.protocol)) throw new TypeError('Expected an HTTP API URL')
  api.username = ''
  api.password = ''
  api.search = ''
  api.hash = ''
  const apiBase = api.toString().replace(/\/$/, '')

  const schemas: Record<string, Schema> = {
    ServerStatusRequest: envelope('action', 'server_status', {
      data: {
        type: 'object',
        required: ['serverID'],
        properties: { serverID: identifier },
        additionalProperties: true,
      },
    }),
    ServerStatusResponse: envelope('action', 'server_status', {
      serverID: identifier,
      version: { type: ['string', 'null'] },
      versionComparator: { type: 'integer', enum: [-1, 0, 1] },
      lastRequest: { type: 'string', format: 'date-time' },
      isWebSocketConnected: { type: 'boolean' },
    }),
    ServerForbidden: envelope('action', 'error', {
      error: { type: 'string', const: 'forbidden' },
      serverID: identifier,
    }),
    ServerLogs: envelope('action', 'server_logs', {
      serverID: identifier,
      data: {
        type: 'object',
        required: ['type', 'data'],
        properties: { type: identifier, data: { type: 'object', additionalProperties: true } },
        additionalProperties: true,
      },
    }),
    SaveConfig: envelope('action', 'save_config', {
      config: { type: 'object', additionalProperties: true },
    }),
    EditSetting: envelope('method', 'wsEditSetting', {
      setting: { type: 'string', pattern: '^ig_.+' },
      value: {},
    }),
    UpdateGroup: envelope('method', 'wsPlayerUpdateGroup', {
      steamID64: steamIdentifier,
      group: identifier,
      add: { type: 'boolean' },
    }),
    SyncName: envelope('method', 'wsSyncName', { steamID64: steamIdentifier, name: { type: 'string' } }),
    PlayerSay: envelope('method', 'wsPlayerSay', {
      name: { type: 'string' },
      content: { type: 'string' },
      avatar: { type: ['string', 'null'] },
    }),
    PlayerAccessRefresh: {
      type: 'object',
      required: ['method'],
      additionalProperties: false,
      properties: {
        method: { type: 'string', const: 'wsRefreshPlayerAccess' },
        steamID: steamIdentifier,
      },
    },
    AddonReady: envelope('action', 'addon.ready', { protocol: { type: 'integer', const: 1 } }),
    AddonRequest: {
      type: 'object',
      required: ['action', 'id', 'method', 'endpoint'],
      additionalProperties: false,
      properties: {
        action: { type: 'string', const: 'addon.request' },
        id: { type: 'string', minLength: 1, maxLength: 96, pattern: '^[a-zA-Z0-9_.:-]+$' },
        method: { type: 'string', enum: ['GET', 'POST'] },
        endpoint: { type: 'string', minLength: 1, maxLength: 256, pattern: '^/[a-zA-Z0-9_/?=:-]+$' },
        body: {},
      },
    },
    AddonResponse: envelope('action', 'addon.response', {
      id: { type: 'string', minLength: 1, maxLength: 96 },
      status: { type: 'integer', minimum: 100, maximum: 599 },
      body: {},
    }),
    LegacyConfig: envelope('method', 'config_save', {
      data: {
        type: 'object',
        required: ['data'],
        properties: { data: { type: 'object', additionalProperties: true } },
      },
    }),
    ConsoleExport: envelope('method', 'console_live_exporter', {
      data: { type: 'object', required: ['data'], properties: { data: { type: 'string', maxLength: 32768 } } },
    }),
    ConsoleExportAction: envelope('action', 'console_live_exporter', {
      data: { type: 'object', required: ['data'], properties: { data: { type: 'string', maxLength: 32768 } } },
    }),
    Rcon: {
      ...envelope('method', 'wsAuthorizedRcon', {
        requestID: { type: 'string', format: 'uuid' },
        steamID: steamIdentifier,
        command: { type: 'string', minLength: 1, maxLength: 8192, pattern: '^[^\\u0000\\r\\n]+$' },
        expiresAt: { type: 'integer', minimum: 1 },
      }),
      additionalProperties: false,
    },
    AddonCommandResult: {
      type: 'object',
      required: ['action', 'id', 'method', 'ok', 'code'],
      additionalProperties: false,
      properties: {
        action: { type: 'string', const: 'addon.command-result' },
        id: { type: 'string', format: 'uuid' },
        method: { type: 'string', const: 'wsAuthorizedRcon' },
        ok: { type: 'boolean' },
        code: { type: 'string', enum: ['executed', 'permission_denied', 'expired', 'execution_failed'] },
      },
      oneOf: [
        { properties: { ok: { const: true }, code: { const: 'executed' } } },
        { properties: { ok: { const: false }, code: { enum: ['permission_denied', 'expired', 'execution_failed'] } } },
      ],
    },
  }

  const messages = {
    serverStatusRequest: message(
      'server_status.request',
      'Demander le statut du serveur',
      "Le dashboard ne peut demander que le statut d'un serveur qu'il est autorisé à administrer.",
      'ServerStatusRequest',
      'dashboard',
      'client-to-server',
      { action: 'server_status', data: { serverID } },
    ),
    serverStatusResponse: message(
      'server_status.response',
      'Recevoir le statut du serveur',
      "Réponse envoyée uniquement à la connexion demandeuse. La présence couvre toutes les instances ; après un crash, elle peut rester positive jusqu'à 90 secondes.",
      'ServerStatusResponse',
      'dashboard',
      'server-to-client',
      {
        action: 'server_status',
        serverID,
        version: '1.0.0',
        versionComparator: 0,
        lastRequest: '2026-01-01T12:00:00.000Z',
        isWebSocketConnected: true,
      },
    ),
    serverForbidden: message(
      'error.forbidden',
      'Accès au serveur refusé',
      "Le serveur demandé n'appartient pas au périmètre d'administration de cette connexion.",
      'ServerForbidden',
      'dashboard',
      'server-to-client',
      { action: 'error', error: 'forbidden', serverID },
    ),
    serverLogs: message(
      'server_logs',
      'Recevoir un log en direct',
      'Diffusion aux dashboards autorisés sur toutes les instances. Le type détermine les champs de data.data. Aucun historique ni rejeu automatique sur cette connexion.',
      'ServerLogs',
      'dashboard',
      'server-to-client',
      { action: 'server_logs', serverID, data: { type: 'connect', data: { name: 'Example player' } } },
    ),
    saveConfig: message(
      'save_config',
      "Enregistrer les paramètres de l'addon",
      'Compatibility envelope for older addons. The gateway removes local credentials/settings and dispatches a correlated POST configuration request through the authenticated addon protocol.',
      'SaveConfig',
      'addon',
      'client-to-server',
      { action: 'save_config', config: { language: 'en' } },
    ),
    editSetting: message(
      'wsEditSetting',
      "Appliquer un paramètre dans l'addon",
      "L'addon retire le préfixe ig_. Les sauvegardes dashboard encodent les valeurs en chaînes (dont les tableaux JSON). Les producteurs historiques peuvent fournir d'autres valeurs JSON. Aucun accusé d'application.",
      'EditSetting',
      'addon',
      'server-to-client',
      { method: 'wsEditSetting', setting: 'ig_language', value: 'en' },
    ),
    updateGroup: message(
      'wsPlayerUpdateGroup',
      'Synchroniser un groupe de joueur',
      "add=true applique le groupe ; add=false remet le joueur au groupe user. Les droits et la direction de synchronisation sont revérifiés avant l'ajout. Le nettoyage après expiration reste permis.",
      'UpdateGroup',
      'addon',
      'server-to-client',
      { method: 'wsPlayerUpdateGroup', steamID64, group: 'moderator', add: true },
    ),
    syncName: message(
      'wsSyncName',
      'Synchroniser le nom du joueur',
      "Commande Discord vers GMod soumise à la direction de synchronisation effective. L'addon applique le nom lorsque le joueur est disponible et DarkRP chargé.",
      'SyncName',
      'addon',
      'server-to-client',
      { method: 'wsSyncName', steamID64, name: 'Example player' },
    ),
    playerSay: message(
      'wsPlayerSay',
      'Relayer un message Discord',
      "Commande Discord vers GMod soumise à la direction de synchronisation du chat. avatar peut être null ; l'addon relaie le message aux clients du jeu.",
      'PlayerSay',
      'addon',
      'server-to-client',
      { method: 'wsPlayerSay', name: 'Example user', content: 'Bonjour', avatar: null },
    ),
    refreshPlayerAccess: message(
      'wsRefreshPlayerAccess',
      'Recheck player access',
      'Asks the authenticated addon to fetch a fresh access decision from the backend. Omit steamID to recheck all online players, or supply one 17-digit Steam ID to target that player. This message grants no access and never changes the manual whitelist; existing manual and administrator permissions still apply. It does not acknowledge the eventual access decision.',
      'PlayerAccessRefresh',
      'addon',
      'server-to-client',
      { method: 'wsRefreshPlayerAccess', steamID: steamID64 },
    ),
    rcon: message(
      'wsAuthorizedRcon',
      'Exécuter une commande console',
      'Requires console.rcon and a linked player currently online with a configured administrator rank. Generate a fresh requestID and short expiresAt deadline. Only a matching addon.command-result confirms console acceptance, not command output. The legacy wsRcon method is rejected.',
      'Rcon',
      'addon',
      'server-to-client',
      {
        method: 'wsAuthorizedRcon',
        requestID: serverID,
        steamID: steamID64,
        command: 'status',
        expiresAt: 1893456000000,
      },
    ),
  }

  const addonMessages = {
    addonReady: message(
      'addon.ready',
      'Addon protocol readiness',
      'Protocol 1 is ready after authentication; a TCP open alone does not authorize requests.',
      'AddonReady',
      'addon',
      'server-to-client',
      { action: 'addon.ready', protocol: 1 },
    ),
    addonRequest: message(
      'addon.request',
      'Dispatch an addon operation',
      'Wait for addon.ready. GET has no non-null body. Endpoint keys are explicitly allowlisted and scoped to the authenticated server; this is not arbitrary HTTP or generic RPC. IDs correlate acknowledgements and cannot be reused with different content.',
      'AddonRequest',
      'addon',
      'client-to-server',
      { action: 'addon.request', id: 'example-request-1', method: 'GET', endpoint: `/servers/${serverID}` },
    ),
    addonResponse: message(
      'addon.response',
      'Receive a correlated addon outcome',
      'Match id to the original request. A timeout, disconnect or delivery_uncertain can leave a mutation outcome unknown; do not automatically replay it. Non-2xx status is a controlled failure.',
      'AddonResponse',
      'addon',
      'server-to-client',
      {
        action: 'addon.response',
        id: 'example-request-1',
        status: 200,
        body: { id: serverID, name: 'Example server' },
      },
    ),
    addonCommandResult: message(
      'addon.command-result',
      'Acknowledge console acceptance',
      'Only a matching authenticated result for the same server and pending UUID can confirm RCON acceptance. Includes no output or credential.',
      'AddonCommandResult',
      'addon',
      'client-to-server',
      { action: 'addon.command-result', id: serverID, method: 'wsAuthorizedRcon', ok: true, code: 'executed' },
    ),
    legacyConfig: message(
      'config_save',
      'Legacy configuration compatibility',
      'Older method/data envelopes are adapted to a server-scoped configuration POST; local credentials are stripped. Current addons use addon.request.',
      'LegacyConfig',
      'addon',
      'client-to-server',
      { method: 'config_save', data: { data: { language: 'en' } } },
    ),
    consoleExport: message(
      'console_live_exporter.method',
      'Stream addon console output',
      'Accepted only after protocol readiness and fresh server authentication. Text is capped at 32768 characters. This has no acknowledgement or durable replay.',
      'ConsoleExport',
      'addon',
      'client-to-server',
      { method: 'console_live_exporter', data: { data: 'Example console message' } },
    ),
    consoleExportAction: message(
      'console_live_exporter.action',
      'Stream console output using the legacy action envelope',
      'Compatibility form of the same bounded, authenticated console stream.',
      'ConsoleExportAction',
      'addon',
      'client-to-server',
      { action: 'console_live_exporter', data: { data: 'Example console message' } },
    ),
  }
  const allMessages = { ...messages, ...addonMessages }

  const operations = Object.fromEntries(
    Object.entries(allMessages).map(([id, value]) => [
      id,
      {
        action: value['x-direction'] === 'client-to-server' ? 'receive' : 'send',
        channel: { $ref: '#/channels/gateway' },
        messages: [{ $ref: `#/channels/gateway/messages/${id}` }],
        title: value.title,
        summary: value.summary,
        tags: [{ name: value['x-client'] }],
        security: [
          {
            $ref: `#/components/securitySchemes/${value['x-client'] === 'dashboard' ? 'dashboardTicket' : 'addonToken'}`,
          },
        ],
      },
    ]),
  )
  const server = { host: websocket.host, protocol: websocket.protocol.slice(0, -1), pathname: websocket.pathname }

  return {
    asyncapi: '3.0.0',
    info: {
      title: 'GMod Integration WebSocket',
      version: '6.0.0',
      description:
        "Contrat du WebSocket actuellement implémenté, du point de vue de la passerelle. Le dashboard échange des messages action ; les commandes vers l'addon utilisent method. Aucune API CRUD/RPC générique. Les notifications sont en direct, sans garantie de livraison durable, d'ordre strict ou de rejeu. Les routes HTTP v6 restent indépendantes.",
      externalDocs: { description: 'Documentation HTTP v6 et console WebSocket', url: `${apiBase}/v6/docs` },
    },
    defaultContentType: 'application/json',
    servers: {
      dashboard: {
        ...server,
        title: 'Dashboard',
        security: [{ $ref: '#/components/securitySchemes/dashboardTicket' }],
        description: `Lire la session sur ${apiBase}/v6/auth/session, puis demander un ticket avec POST ${apiBase}/v6/auth/ws-ticket. Les mutations par cookie exigent X-CSRF-Token. Le ticket à usage unique expire au plus tard dans 30 secondes ou à l'expiration de la session. Ajouter ?ticket=... au handshake, puis jeter ce ticket. Chaque reconnexion en exige un nouveau. Ne jamais placer un jeton de session durable dans l'URL.`,
      },
      addon: {
        ...server,
        title: 'Addon Garry’s Mod',
        security: [{ $ref: '#/components/securitySchemes/addonToken' }],
        description:
          "Même passerelle, handshake distinct : les en-têtes id ET token sont tous deux obligatoires et vérifiés ensemble. Des en-têtes partiels ou invalides ne basculent pas vers un ticket dashboard. Ce mode nécessite un client natif capable de définir les en-têtes ; il n'est pas disponible dans la console WebSocket du navigateur.",
        'x-required-headers': ['id', 'token'],
      },
    },
    channels: {
      gateway: {
        address: '/',
        title: 'Connexion WebSocket',
        description: 'Une connexion physique ; le handshake détermine les messages autorisés pour dashboard ou addon.',
        servers: [{ $ref: '#/servers/dashboard' }, { $ref: '#/servers/addon' }],
        messages: Object.fromEntries(
          Object.keys(allMessages).map((id) => [id, { $ref: `#/components/messages/${id}` }]),
        ),
        bindings: {
          ws: {
            method: 'GET',
            query: { type: 'object', properties: { ticket: { type: 'string', minLength: 40, maxLength: 64 } } },
            headers: { type: 'object', properties: { id: identifier, token: identifier } },
            bindingVersion: '0.1.0',
          },
        },
      },
    },
    operations,
    components: {
      messages: allMessages,
      schemas,
      securitySchemes: {
        dashboardTicket: {
          type: 'httpApiKey',
          in: 'query',
          name: 'ticket',
          description: 'Ticket éphémère à usage unique obtenu avec une session HTTP valide, jamais un Bearer durable.',
        },
        addonToken: {
          type: 'httpApiKey',
          in: 'header',
          name: 'token',
          description: "Jeton de l'addon, obligatoirement accompagné de l'en-tête id du serveur.",
        },
      },
    },
    'x-session-lifecycle': {
      heartbeatSeconds: 30,
      sessionRecheckMaxSeconds: 60,
      permissionSnapshotSeconds: 30,
      discordPermissionCacheSeconds: 120,
      presenceLeaseMaxSeconds: 90,
      description:
        'Les messages WebSocket ne prolongent pas la session HTTP. Révocation et effacement ferment les connexions concernées. Les sessions sont revérifiées avant livraison ; une panne de permissions ne conserve pas un accès invérifiable.',
    },
    'x-close-codes': {
      1003: 'Addon binary frames are unsupported.',
      1007: 'Malformed addon JSON.',
      1009: 'Addon frame or response exceeds its byte budget.',
      1001: 'Redémarrage du service : reconnecter avec un nouveau ticket.',
      1008: 'Invalid/revoked credentials or request limits exceeded. Dashboard sessions must be rechecked through HTTP.',
      1013: 'Service temporairement indisponible : réessayer avec temporisation et un nouveau ticket.',
      4003: 'Autorisation Discord à renouveler : conserver la session applicative et les brouillons.',
    },
    'x-addon-transport': {
      protocol: 1,
      maxFrameBytes: 12582912,
      maxActiveRequests: 4,
      maxActiveBytes: 25165824,
      maxRequestsPer10Seconds: 600,
      requestTimeoutSeconds: 25,
      recentRequestIds: 128,
      recentRequestTtlSeconds: 120,
      bodyMaxDepth: 24,
      bodyMaxCollectionEntries: 512,
      bodyMaxNodes: 32768,
      description:
        'Per-connection bounded request correlation, without durable exactly-once delivery. The Lua sender additionally bounds its unsent queue; uncertain mutations are not replayed.',
    },
    'x-known-protocol-gaps': [
      'The frontend knows access_changed, but no producer is mounted; access refreshes through HTTP.',
    ],
  }
}
