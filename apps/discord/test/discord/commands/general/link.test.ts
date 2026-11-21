import { limitResources } from '@gmod/schema/server/AccessPolicySchema.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveAccessMock = vi.fn()
vi.mock('@gmod/domain-access/index.js', () => ({ resolveGuildAccess: resolveAccessMock, limitResources }))

const getTranslateMock = vi.fn(async (key: string, _lang?: string, params?: string[]) =>
  params ? `${key}:${params.join(',')}` : key,
)
vi.mock('@gmod/core/utils/localizations.js', () => ({ getTranslate: getTranslateMock }))

let configServerMock: any = { websiteUrl: 'https://example.test' }
vi.mock('@gmod/config', () => ({
  get ConfigServer() {
    return configServerMock
  },
}))

const prismaMock = {
  gm_server_links: { findFirst: vi.fn(), findMany: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const link = (await import('../../../../src/discord/commands/general/link.js')).default

function makeInteraction(overrides: Record<string, any> = {}) {
  return {
    guild: { id: 'g1', preferredLocale: 'en-US' },
    member: { permissions: { has: vi.fn(() => false) } },
    options: {
      getString: vi.fn(),
      getFocused: vi.fn(),
    },
    reply: vi.fn(),
    respond: vi.fn(),
    ...overrides,
  } as any
}

beforeEach(() => {
  resolveAccessMock.mockReset().mockResolvedValue({ premium: true, customBot: false, state: 'ready' })
  getTranslateMock.mockClear()
  configServerMock = { websiteUrl: 'https://example.test' }
  prismaMock.gm_server_links.findFirst.mockReset()
  prismaMock.gm_server_links.findMany.mockReset().mockResolvedValue([])
})

describe('commands/general/link execute', () => {
  it('returns early when there is no guild', async () => {
    const interaction = makeInteraction({ guild: null })
    const result = await link.execute(interaction)
    expect(result).toBeUndefined()
  })

  it('returns early when there is no member', async () => {
    const interaction = makeInteraction({ member: null })
    const result = await link.execute(interaction)
    expect(result).toBeUndefined()
  })

  it('returns early when the link option is missing', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue(null)
    const result = await link.execute(interaction)
    expect(result).toBeUndefined()
    expect(prismaMock.gm_server_links.findFirst).not.toHaveBeenCalled()
  })

  it('replies with the set-link admin hint when the link is unset and the member is an admin', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue('42')
    interaction.member.permissions.has.mockReturnValue(true)
    prismaMock.gm_server_links.findMany.mockResolvedValueOnce([])

    await link.execute(interaction)

    expect(prismaMock.gm_server_links.findMany).toHaveBeenCalledWith({ where: { guild: 'g1' }, orderBy: { id: 'asc' } })
    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining('how_to_set_the_link'),
      ephemeral: true,
    })
  })

  it('replies with the plain not-set message when the link is unset and the member is not an admin', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue('42')
    interaction.member.permissions.has.mockReturnValue(false)
    prismaMock.gm_server_links.findMany.mockResolvedValueOnce([])

    await link.execute(interaction)

    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'the_link_to_not_set:`42`',
      ephemeral: true,
    })
  })

  it('replies with the encoded link when found', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue('42')
    prismaMock.gm_server_links.findMany.mockResolvedValueOnce([
      {
        id: 42,
        active: true,
        alias: 'My Link',
        url: 'https://target.test/a b',
      },
    ])

    await link.execute(interaction)

    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining('https%3A%2F%2Ftarget.test%2Fa%20b'),
    })
  })
})

describe('commands/general/link autocomplete', () => {
  it('returns early when there is no guild', async () => {
    const interaction = makeInteraction({ guild: null })
    const result = await link.autocomplete(interaction)
    expect(result).toBeUndefined()
    expect(prismaMock.gm_server_links.findMany).not.toHaveBeenCalled()
  })

  it('filters out links without an alias, duplicate ids, and inactive links, then responds', async () => {
    const interaction = makeInteraction()
    interaction.options.getFocused.mockReturnValue({ value: '1' })
    prismaMock.gm_server_links.findMany.mockResolvedValueOnce([
      { id: 1, alias: null, active: true },
      { id: 2, alias: 'Second', active: true },
      { id: 2, alias: 'Second Dup', active: true },
      { id: 3, alias: 'Inactive', active: false },
      { id: 10, alias: 'Ten', active: true },
    ])

    await link.autocomplete(interaction)

    expect(prismaMock.gm_server_links.findMany).toHaveBeenCalledWith({ where: { guild: 'g1' }, orderBy: { id: 'asc' } })
    expect(interaction.respond).toHaveBeenCalledWith([{ name: 'Ten', value: '10' }])
  })
  it('limits autocomplete and direct execution to the same first two saved Free links', async () => {
    resolveAccessMock.mockResolvedValue({ premium: false, customBot: false, state: 'ready' })
    const links = [1, 2, 3].map((id) => ({ id, alias: `Link ${id}`, active: true, url: `https://example.test/${id}` }))
    prismaMock.gm_server_links.findMany.mockResolvedValue(links)
    const interaction = makeInteraction()
    interaction.options.getFocused.mockReturnValue({ value: '' })
    await link.autocomplete(interaction)
    expect(interaction.respond).toHaveBeenCalledWith([
      { name: 'Link 1', value: '1' },
      { name: 'Link 2', value: '2' },
    ])
    interaction.options.getString.mockReturnValue('3')
    await link.execute(interaction)
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'the_link_to_not_set:`3`', ephemeral: true })
    expect(prismaMock.gm_server_links.findMany).toHaveBeenCalledWith({ where: { guild: 'g1' }, orderBy: { id: 'asc' } })
  })
  it('does not serve an inactive link by a directly supplied id', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue('1')
    prismaMock.gm_server_links.findMany.mockResolvedValue([
      { id: 1, alias: 'Inactive', active: false, url: 'https://example.test' },
    ])
    await link.execute(interaction)
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'the_link_to_not_set:`1`', ephemeral: true })
  })
})
