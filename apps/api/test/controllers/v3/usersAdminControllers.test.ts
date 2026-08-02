import { describe, expect, it, vi } from 'vitest'

const getAllActivePanelUsersMock = vi.fn()
vi.mock('@gmod/core/models/v3/usersAdminControllerModels.js', () => ({
  getAllActivePanelUsers: getAllActivePanelUsersMock,
}))

const { getAllPanelUsers } = await import('../../../src/controllers/v3/usersAdminControllers.js')

describe('getAllPanelUsers', () => {
  it('responds 200 with the list of panel users', async () => {
    getAllActivePanelUsersMock.mockResolvedValueOnce([{ id: 1 }])
    const json = vi.fn()
    const status = vi.fn().mockReturnValue({ json })

    await getAllPanelUsers({} as any, { status } as any)

    expect(status).toHaveBeenCalledWith(200)
    expect(json).toHaveBeenCalledWith([{ id: 1 }])
  })
})
