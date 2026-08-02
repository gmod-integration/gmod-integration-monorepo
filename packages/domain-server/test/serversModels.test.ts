import { beforeEach, describe, expect, it, vi } from 'vitest'

const findManyMock = vi.fn()
vi.mock('@gmod/infra-prisma', () => ({ default: { gm_server: { findMany: findManyMock } } }))

const { getServerList } = await import('../src/serversModels.js')

describe('getServerList', () => {
  beforeEach(() => {
    findManyMock.mockReset()
  })

  it('returns [] without querying when the interaction has no guildId', async () => {
    const interaction = { guildId: null } as any
    const result = await getServerList(interaction, { value: '' } as any, {})
    expect(result).toEqual([])
    expect(findManyMock).not.toHaveBeenCalled()
  })

  it('builds choices from the guild servers and filters by the focused option value', async () => {
    findManyMock.mockResolvedValueOnce([
      { id: 's1', name: 'Alpha Server' },
      { id: 's2', name: 'Beta Server' },
    ])

    const interaction = { guildId: 'g1' } as any
    const result = await getServerList(interaction, { value: 'Alpha' } as any, {})

    expect(findManyMock).toHaveBeenCalledWith({ where: { guild: 'g1' } })
    expect(result).toEqual(['Alpha Server'])
  })

  it('skips servers without a name', async () => {
    findManyMock.mockResolvedValueOnce([{ id: 's1', name: '' }, { id: 's2', name: 'Beta' }])

    const result = await getServerList({ guildId: 'g1' } as any, { value: '' } as any, {})

    expect(result).toEqual(['Beta'])
  })

  it('includes pre-seeded choices that match the focused value', async () => {
    findManyMock.mockResolvedValueOnce([])

    const result = await getServerList({ guildId: 'g1' } as any, { value: 'Existing' } as any, {
      'Existing Choice': 'sX',
    })

    expect(result).toEqual(['Existing Choice'])
  })
})
