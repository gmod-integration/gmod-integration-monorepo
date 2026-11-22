import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import {
  GuildDashboardSettingsRequestSchema,
  ServerDashboardSettingsRequestSchema,
} from '@gmod/schema/server/DashboardSettingsSchema.js'
import { StatusConfigurationSaveSchema } from '@gmod/schema/server/StatusConfigurationSchema.js'
import { AccountErasureRequestSchema } from '@gmod/schema/user/AccountErasureSchema.js'
import { createOpenApiDocument } from '../../src/docs/openapi.js'

const methods = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options']
const document = createOpenApiDocument('http://localhost:53136/')
const paths = document.paths!

/** Read the mounted router tree without booting workers or connecting to application databases. */
function mountedOperations(file: string, prefix = ''): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const imports = new Map<string, string>()
  const strings = new Map<string, string>()
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      statement.importClause?.name &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      imports.set(statement.importClause.name.text, statement.moduleSpecifier.text)
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer && ts.isStringLiteral(declaration.initializer))
          strings.set(declaration.name.text, declaration.initializer.text)
      }
    }
  }
  const text = (node: ts.Node | undefined) =>
    node && ts.isStringLiteral(node) ? node.text : node && ts.isIdentifier(node) ? strings.get(node.text) : undefined
  const result: string[] = []
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'router'
    ) {
      const method = node.expression.name.text
      const route = text(node.arguments[0])
      if (methods.includes(method)) {
        expect(route, `Unrecognized route declaration in ${file}`).toBeDefined()
        const path = `${prefix}${route}`.replace(/:([A-Za-z]\w*)/g, '{$1}').replace(/\/$/, '') || '/'
        result.push(`${method.toUpperCase()} ${path}`)
      } else if (method === 'use') {
        const mount = route === undefined ? '' : route
        if (mount !== '/docs') {
          for (const argument of node.arguments.slice(route === undefined ? 0 : 1)) {
            const imported = ts.isIdentifier(argument) ? imports.get(argument.text) : undefined
            if (imported?.startsWith('.'))
              result.push(
                ...mountedOperations(resolve(dirname(file), imported.replace(/\.js$/, '.ts')), prefix + mount),
              )
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return result
}

describe('v6 OpenAPI contract', () => {
  it('documents exactly the operations mounted by the current v6 router', () => {
    const actual = mountedOperations(fileURLToPath(new URL('../../src/routes/v6/_v6Routes.ts', import.meta.url)))
    const described = Object.entries(paths).flatMap(([path, item]) =>
      methods.filter((method) => method in item).map((method) => `${method.toUpperCase()} ${path}`),
    )
    expect(described.sort()).toEqual(actual.sort())
    expect(described).toHaveLength(35)
    expect(new Set(described).size).toBe(described.length)
  })

  it('resolves every local reference and names every operation uniquely', () => {
    const ids: string[] = []
    for (const item of Object.values(paths))
      for (const method of methods) {
        const value = item[method as keyof typeof item]
        if (value && typeof value === 'object' && 'operationId' in value) ids.push(String(value.operationId))
      }
    expect(new Set(ids).size).toBe(ids.length)

    let references = 0
    function walk(value: unknown) {
      if (!value || typeof value !== 'object') return
      if ('$ref' in value) {
        const reference = String(value.$ref)
        expect(reference.startsWith('#/')).toBe(true)
        const target = reference
          .slice(2)
          .split('/')
          .reduce<unknown>((current, part) => {
            const key = part.replace(/~1/g, '/').replace(/~0/g, '~')
            return current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined
          }, document)
        expect(target, reference).toBeDefined()
        references++
      }
      for (const child of Object.values(value)) walk(child)
    }
    walk(document)
    expect(references).toBeGreaterThan(50)
    expect(() => JSON.stringify(document)).not.toThrow()
  })

  it('matches cookie names to the deployed API scheme and keeps credential classes separate', () => {
    const secure = createOpenApiDocument('https://api.example.test/')
    expect(document.openapi).toBe('3.1.0')
    expect(document.servers).toEqual([{ url: 'http://localhost:53136/v6', description: 'Configured API service' }])
    expect(secure.servers?.[0].url).toBe('https://api.example.test/v6')
    expect(document.components?.securitySchemes?.sessionCookie).toMatchObject({ in: 'cookie', name: 'gmi_session' })
    expect(secure.components?.securitySchemes?.sessionCookie).toMatchObject({ name: '__Host-gmi_session' })
    expect(secure.components?.securitySchemes?.actorCookie).toMatchObject({ name: '__Host-gmi_actor_session' })
    expect(document.security).toEqual([{ sessionCookie: [] }, { sessionBearer: [] }])
    expect(paths['/account/erasure-requests/{requestId}'].get?.security).toEqual([{ erasureReceipt: [] }])
    expect(paths['/auth/impersonations/end'].post?.security).toEqual([{ actorCookie: [] }])
    expect(paths['/auth/legacy-session'].post?.security).toEqual([])
    expect(paths['/'].get?.security).toEqual([])
  })

  it('describes CSRF on cookie mutations and the special delegated-session recovery response', () => {
    const writes = [
      paths['/auth/logout'].post,
      paths['/auth/sessions/{id}'].delete,
      paths['/auth/ws-ticket'].post,
      paths['/auth/impersonations'].post,
      paths['/auth/impersonations/end'].post,
      paths['/guilds/{guildID}/settings'].put,
      paths['/guilds/{guildID}/servers/{serverID}/settings'].put,
      paths['/guilds/{guildID}/servers/{serverID}/status/configuration'].put,
      paths['/account/erasure-requests'].post,
    ]
    for (const operation of writes)
      expect(operation?.parameters).toContainEqual(expect.objectContaining({ name: 'X-CSRF-Token', in: 'header' }))
    expect(paths['/auth/impersonations/end'].post?.parameters).toContainEqual(
      expect.objectContaining({ name: 'X-CSRF-Token', required: true }),
    )
    expect(JSON.stringify(paths['/auth/session'].get?.responses?.['401'])).toContain(
      '#/components/schemas/ActorRecovery',
    )
    expect(paths['/auth/session'].get?.description).toContain('actor_session_available')
    expect(paths['/auth/ws-ticket'].post?.description).toContain('30 seconds')
  })

  it('generates strict write shapes from the shared request validators and supplies accepted examples', () => {
    const operations = [
      [paths['/guilds/{guildID}/settings'].put, GuildDashboardSettingsRequestSchema],
      [paths['/guilds/{guildID}/servers/{serverID}/settings'].put, ServerDashboardSettingsRequestSchema],
      [paths['/guilds/{guildID}/servers/{serverID}/status/configuration'].put, StatusConfigurationSaveSchema],
      [paths['/account/erasure-requests'].post, AccountErasureRequestSchema],
    ] as const
    for (const [operation, validator] of operations) {
      const requestBody = operation?.requestBody
      expect(requestBody && 'content' in requestBody).toBe(true)
      if (!requestBody || !('content' in requestBody)) throw new Error('Missing generated request body')
      const media = requestBody.content['application/json']!
      const schema = media.schema!
      expect(schema).toMatchObject({ type: 'object', additionalProperties: false })
      expect(validator.safeParse(media.example).success).toBe(true)
    }
    const requestBody = paths['/guilds/{guildID}/servers/{serverID}/settings'].put!.requestBody!
    if (!('content' in requestBody)) throw new Error('Missing server settings body')
    expect(requestBody.content['application/json']?.schema).toMatchObject({ required: ['settings'] })
    expect(JSON.stringify(requestBody)).toContain('ig_supportLink')
    expect(JSON.stringify(requestBody)).toContain('sync_role_direction')
  })

  it('keeps status revisions and erasure acknowledgement semantics explicit', () => {
    expect(paths['/guilds/{guildID}/servers/{serverID}/status/configuration'].put?.responses).toHaveProperty('409')
    expect(paths['/account/erasure-requests'].post?.responses).toHaveProperty('202')
    expect(paths['/account/erasure-requests'].post?.description).toContain('Destructive operation')
    expect(paths['/account/erasure-requests/{requestId}'].get?.description).toContain(
      'not an application session credential',
    )
    const session = document.components?.schemas?.Session
    expect(JSON.stringify(session)).not.toContain('accessToken')
    expect(JSON.stringify(document.components?.schemas?.SessionList)).not.toContain('tokenHash')
    expect(JSON.stringify(document.components?.schemas?.AccountErasureStatus)).not.toContain('receipt')
  })
})
