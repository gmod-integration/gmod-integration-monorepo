import { describe, expect, it, vi } from 'vitest'

const findManyMock = vi.fn()
vi.mock('@gmod/infra-prisma', () => ({ default: { gm_panelToken: { findMany: findManyMock } } }))

const { getAllActivePanelUsers } = await import('../../../src/models/v3/usersAdminControllerModels.js')

describe('getAllActivePanelUsers', () => {
  it('queries panel tokens with a future expirationDate', async () => {
    findManyMock.mockResolvedValueOnce([{ id: 1 }])
    await expect(getAllActivePanelUsers()).resolves.toEqual([{ id: 1 }])
    expect(findManyMock).toHaveBeenCalledWith({ where: { expirationDate: { gt: expect.any(Date) } } })
  })
})
