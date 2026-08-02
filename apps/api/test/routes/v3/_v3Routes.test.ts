import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/routes/v3/serversRoutes.js', () => ({ default: express.Router() }))
vi.mock('../../../src/routes/v3/bansRoutes.js', () => ({ default: express.Router() }))
vi.mock('../../../src/routes/v3/clientsRoutes.js', () => ({ default: express.Router() }))
vi.mock('../../../src/routes/v3/usersRoutes.js', () => ({ default: express.Router() }))
vi.mock('../../../src/routes/v3/mainRoutes.js', () => ({ default: express.Router() }))

const { default: router } = await import('../../../src/routes/v3/_v3Routes.js')

describe('_v3Routes', () => {
  it('responds with a status/version payload at the root', async () => {
    const app = express()
    app.use(router)

    const response = await request(app).get('/')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok', version: 'v3' })
  })

  it('mounts the servers/bans/clients/users/main sub-routers', () => {
    const mountedPaths = router.stack.filter((layer: any) => layer.name === 'router').map((layer: any) => layer.regexp)
    expect(mountedPaths.length).toBeGreaterThanOrEqual(5)
  })
})
