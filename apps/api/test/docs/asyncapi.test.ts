import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import Ajv from 'ajv'
import { describe, expect, it } from 'vitest'
import { createAsyncApiDocument } from '../../src/docs/asyncapi.js'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')
const document = () => createAsyncApiDocument('ws://localhost:53139', 'http://localhost:53136')

function resolveReference(value: unknown, reference: string): unknown {
  return reference
    .slice(2)
    .split('/')
    .reduce((current: any, key) => current?.[key], value)
}

function references(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, nested]) => (key === '$ref' ? [String(nested)] : references(nested)))
}

describe('the implemented WebSocket AsyncAPI contract', () => {
  it('describes one physical channel and both authenticated handshake modes', () => {
    const doc = document()
    expect(doc.asyncapi).toBe('3.0.0')
    expect(Object.keys(doc.channels)).toEqual(['gateway'])
    expect(doc.channels.gateway.address).toBe('/')
    expect(doc.servers.dashboard).toMatchObject({ host: 'localhost:53139', protocol: 'ws', pathname: '/' })
    expect(doc.servers.addon).toMatchObject({ host: 'localhost:53139', protocol: 'ws', pathname: '/' })
    expect(doc.components.securitySchemes.dashboardTicket).toMatchObject({
      type: 'httpApiKey',
      in: 'query',
      name: 'ticket',
    })
    expect(doc.components.securitySchemes.addonToken).toMatchObject({
      type: 'httpApiKey',
      in: 'header',
      name: 'token',
    })
    expect(doc.servers.addon['x-required-headers']).toEqual(['id', 'token'])
    expect(doc.servers.dashboard.description).toContain('http://localhost:53136/v6/auth/ws-ticket')
    expect(doc.servers.dashboard.description).toContain('X-CSRF-Token')
    expect(doc.servers.dashboard.description).toContain('30 secondes')
  })

  it('uses configured public endpoints while excluding URL credentials and query credentials', () => {
    const doc = createAsyncApiDocument(
      'wss://user:gateway-secret@ws.example.com/gateway?ticket=private-ticket#fragment',
      'https://user:api-secret@api.example.com/prefix/?token=private-token#fragment',
    )
    expect(doc.servers.dashboard).toMatchObject({ host: 'ws.example.com', protocol: 'wss', pathname: '/gateway' })
    expect(doc.info.externalDocs.url).toBe('https://api.example.com/prefix/v6/docs')
    for (const secret of ['gateway-secret', 'private-ticket', 'api-secret', 'private-token', 'fragment'])
      expect(JSON.stringify(doc)).not.toContain(secret)
  })

  it.each([
    ['https://ws.example.com', 'https://api.example.com'],
    ['wss://ws.example.com', 'ftp://api.example.com'],
  ])('rejects a non-WebSocket gateway or non-HTTP API URL', (wsUrl, apiUrl) => {
    expect(() => createAsyncApiDocument(wsUrl, apiUrl)).toThrow(TypeError)
  })

  it('resolves every reference and scopes operation messages through the physical channel', () => {
    const doc = document()
    for (const reference of references(doc)) {
      expect(reference.startsWith('#/')).toBe(true)
      expect(resolveReference(doc, reference), reference).toBeDefined()
    }
    for (const [id, operation] of Object.entries(doc.operations)) {
      expect(operation.channel.$ref).toBe('#/channels/gateway')
      expect(operation.messages).toEqual([{ $ref: `#/channels/gateway/messages/${id}` }])
      const contract = doc.components.messages[id as keyof typeof doc.components.messages]
      expect(operation.action).toBe(contract['x-direction'] === 'client-to-server' ? 'receive' : 'send')
      expect(operation.security[0].$ref).toBe(
        `#/components/securitySchemes/${contract['x-client'] === 'dashboard' ? 'dashboardTicket' : 'addonToken'}`,
      )
    }
  })

  it('validates every documented wire example against its JSON schema and rejects missing discriminators', () => {
    const doc = document()
    const validator = new Ajv({ allErrors: true, schemaId: 'auto' })
    for (const contract of Object.values(doc.components.messages)) {
      const payloadSchema = resolveReference(doc, contract.payload.$ref) as Record<string, unknown>
      const validate = validator.compile(payloadSchema)
      for (const example of contract.examples) {
        expect(validate(example.payload), JSON.stringify(validate.errors)).toBe(true)
        const malformed = { ...example.payload }
        delete malformed.action
        delete malformed.method
        expect(validate(malformed), contract.name).toBe(false)
      }
    }
    const status = validator.compile(doc.components.schemas.ServerStatusResponse)
    expect(status({ ...doc.components.messages.serverStatusResponse.examples[0].payload, version: null })).toBe(true)
    expect(
      status({ ...doc.components.messages.serverStatusResponse.examples[0].payload, lastRequest: 'not-a-date' }),
    ).toBe(false)
  })

  it('matches dashboard and addon incoming actions actually handled by the gateway', () => {
    const doc = document()
    const gateway = source('apps/websocket/src/main.ts')
    const dashboardActions = [...gateway.matchAll(/info\.action === '([^']+)'/g)].map((match) => match[1])
    const addonGateway = source('apps/websocket/src/addonGateway.ts')
    const addonActions = [...addonGateway.matchAll(/packet\.(?:action|method) (?:===|!==) '([^']+)'/g)].map(
      (match) => match[1],
    )
    const incoming = Object.values(doc.components.messages).filter(
      (contract) => contract['x-direction'] === 'client-to-server',
    )
    for (const [client, actual] of [
      ['dashboard', dashboardActions],
      ['addon', addonActions],
    ] as const) {
      expect(
        new Set(
          incoming
            .filter((contract) => contract['x-client'] === client)
            .map((contract) => contract.examples[0].payload.action || contract.examples[0].payload.method),
        ),
      ).toEqual(new Set(actual))
    }
  })

  it('documents exactly the emitted addon methods and their installed Lua handlers', () => {
    const producerPaths = [
      'packages/domain-server/src/Server.ts',
      'packages/core/src/models/v6/dashboardSettings.ts',
      'packages/core/src/classes/v3/PlayerGmod.ts',
      'packages/domain-guild/src/discordModels.ts',
      'packages/core/src/models/v3/guildsControllerModels.ts',
      'packages/infra-websocket/src/addonCommands.ts',
    ]
    const emitted = new Set(
      producerPaths.flatMap((path) => [...source(path).matchAll(/method: '(ws[^']+)'/g)].map((match) => match[1])),
    )
    const addonOutgoing = Object.values(document().components.messages).filter(
      (contract) =>
        contract['x-client'] === 'addon' &&
        contract['x-direction'] === 'server-to-client' &&
        typeof contract.examples[0].payload.method === 'string',
    )
    const documented = new Set(addonOutgoing.map((contract) => contract.examples[0].payload.method))
    expect(documented).toEqual(emitted)
    const luaPaths = [
      'core/config/sv_settings.lua',
      'modules/sync_usergroups/sv_sync_roles.lua',
      'modules/sync_pseudos/sv_sync_names.lua',
      'modules/sync_chat/sv_sync_chat.lua',
      'modules/console_commands/sv_rcon.lua',
    ]
    const luaHandlers = new Set(
      luaPaths.flatMap((path) =>
        [
          ...source('submodules/gmod-integration/lua/gmod_integration/' + path).matchAll(/function gmInte\.(ws\w+)\(/g),
        ].map((match) => match[1]),
      ),
    )
    expect(documented).toEqual(luaHandlers)
    expect(document().components.messages.rcon.examples[0].payload).toHaveProperty('steamID')
    expect(document().components.messages.updateGroup.examples[0].payload).toHaveProperty('steamID64')
  })

  it('keeps unsupported messages and transport guarantees distinct from the active protocol', () => {
    const doc = document()
    expect(Object.keys(doc.components.messages)).not.toContain('access_changed')
    expect(doc.components.messages.legacyConfig.examples[0].payload.method).toBe('config_save')
    expect(doc.components.messages.consoleExport.examples[0].payload.method).toBe('console_live_exporter')
    expect(doc.components.messages.rcon.examples[0].payload.method).toBe('wsAuthorizedRcon')
    expect(doc['x-known-protocol-gaps'].join(' ')).toContain('access_changed')
    expect(doc.info.description).toContain('sans garantie de livraison durable')
    expect(Object.keys(doc['x-close-codes'])).toEqual(['1001', '1003', '1007', '1008', '1009', '1013', '4003'])
    expect(doc['x-session-lifecycle']).toMatchObject({
      heartbeatSeconds: 30,
      sessionRecheckMaxSeconds: 60,
      permissionSnapshotSeconds: 30,
      discordPermissionCacheSeconds: 120,
      presenceLeaseMaxSeconds: 90,
    })
  })
})
