import express from 'express'
import request from 'supertest'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/routes/webhooks/_webhooksRoutes.js', () => ({ default: express.Router() }))
vi.mock('@/routes/v3/_v3Routes.js', () => ({ default: express.Router() }))
vi.mock('@/routes/v6/_v6Routes.js', () => ({ default: express.Router() }))
vi.mock('@/routes/steamRoutes.js', () => ({ default: express.Router() }))

const prismaMock: any = { gm_users_data_request: { findFirst: vi.fn() } }
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const s3SendMock = vi.fn()
vi.mock('@gmod/infra-minio', () => ({ AVATAR_BUCKET: 'gmi-avatars', s3: { send: s3SendMock } }))

const { default: router } = await import('../../src/routes/mainRoutes.js')

function makeApp() {
  const app = express()
  app.use(router)
  return app
}

describe('mainRoutes', () => {
  beforeEach(() => {
    prismaMock.gm_users_data_request.findFirst.mockReset()
    s3SendMock.mockReset()
  })
  afterEach(() => vi.restoreAllMocks())

  describe('GET /avatars/:provider/:id', () => {
    it('does not serve erased Discord or Steam avatars from object storage', async () => {
      const privacy = await import('@gmod/domain-user/privacy.js')
      const guard = vi.spyOn(privacy, 'isErasureBlocked').mockResolvedValueOnce(true).mockResolvedValueOnce(true)
      for (const provider of ['discord', 'steam']) {
        const response = await request(makeApp()).get(`/avatars/${provider}/123`)
        expect(response.status).toBe(404)
        expect(response.headers['cache-control']).toBe('no-store')
      }
      expect(guard).toHaveBeenCalledWith('123', null)
      expect(guard).toHaveBeenCalledWith(null, '123')
      expect(s3SendMock).not.toHaveBeenCalled()
    })
    it('returns 400 for an unrecognized provider', async () => {
      const response = await request(makeApp()).get('/avatars/unknown/123')
      expect(response.status).toBe(400)
    })

    it('streams the avatar body on success', async () => {
      s3SendMock.mockResolvedValueOnce({ ContentType: 'image/png', Body: Readable.from(['fake-image-bytes']) })
      const response = await request(makeApp()).get('/avatars/discord/123')
      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('image/png')
      expect(response.body.toString()).toBe('fake-image-bytes')
    })

    it('defaults the content type when none is returned', async () => {
      s3SendMock.mockResolvedValueOnce({ Body: Readable.from(['bytes']) })
      const response = await request(makeApp()).get('/avatars/steam/123')
      expect(response.headers['content-type']).toContain('image/webp')
    })

    it('ends the response with an error message when Body is not a stream', async () => {
      s3SendMock.mockResolvedValueOnce({ Body: 'not-a-stream' })
      const response = await request(makeApp()).get('/avatars/guild/123')
      expect(response.body.toString()).toBe('Error: no stream returned')
    })

    it('returns 404 when the S3 fetch fails', async () => {
      s3SendMock.mockRejectedValueOnce(new Error('not found'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const response = await request(makeApp()).get('/avatars/discord/123')
      expect(response.status).toBe(404)
      expect(errorSpy).toHaveBeenCalled()
    })
  })

  describe('GET /screenshots/:filename', () => {
    it.each(['image/svg+xml', 'text/html', 'application/octet-stream'])(
      'refuses a non-raster stored content type: %s',
      async (contentType) => {
        const body = Readable.from(['unsupported content'])
        s3SendMock.mockResolvedValueOnce({ ContentType: contentType, Body: body })
        const response = await request(makeApp()).get('/screenshots/file1.jpeg')
        expect(response.status).toBe(404)
        expect(response.headers['cache-control']).toBe('no-store')
        expect(response.text).not.toContain('unsupported content')
        expect(body.destroyed).toBe(true)
      },
    )

    it('streams the screenshot body on success', async () => {
      s3SendMock.mockResolvedValueOnce({ ContentType: 'image/jpeg', Body: Readable.from(['screenshot-bytes']) })
      const response = await request(makeApp()).get('/screenshots/file1.jpeg')
      expect(response.status).toBe(200)
      expect(response.body.toString()).toBe('screenshot-bytes')
      expect(response.headers['content-security-policy']).toBe("default-src 'none'; sandbox")
      expect(response.headers['x-content-type-options']).toBe('nosniff')
    })

    it('defaults the content type when none is returned', async () => {
      s3SendMock.mockResolvedValueOnce({ Body: Readable.from(['bytes']) })
      const response = await request(makeApp()).get('/screenshots/file1.jpeg')
      expect(response.headers['content-type']).toContain('image/jpeg')
    })

    it('ends the response with an error message when Body is not a stream', async () => {
      s3SendMock.mockResolvedValueOnce({ Body: null })
      const response = await request(makeApp()).get('/screenshots/file1.jpeg')
      expect(response.body.toString()).toBe('Error: no stream returned')
    })

    it('returns 404 when the S3 fetch fails', async () => {
      s3SendMock.mockRejectedValueOnce(new Error('not found'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const response = await request(makeApp()).get('/screenshots/file1.jpeg')
      expect(response.status).toBe(404)
      expect(errorSpy).toHaveBeenCalled()
    })
  })

  describe('GET /gdpr-request/:uuid', () => {
    it('returns 400 when the code query param is missing', async () => {
      const response = await request(makeApp()).get('/gdpr-request/u1')
      expect(response.status).toBe(400)
      expect(response.body).toEqual({ error: 'missing_code' })
    })

    it('returns 404 when the code/uuid pair does not match a valid request', async () => {
      prismaMock.gm_users_data_request.findFirst.mockResolvedValueOnce(null)
      const response = await request(makeApp()).get('/gdpr-request/u1?code=abc')
      expect(response.status).toBe(404)
      expect(response.body).toEqual({ error: 'invalid_code' })
    })

    it('streams the GDPR zip body on success', async () => {
      prismaMock.gm_users_data_request.findFirst.mockResolvedValueOnce({ id: 'u1' })
      s3SendMock.mockResolvedValueOnce({ Body: Readable.from(['zip-bytes']) })
      const response = await request(makeApp()).get('/gdpr-request/u1?code=abc')
      expect(response.status).toBe(200)
      expect(response.headers['content-disposition']).toContain('u1.zip')
      expect(response.text).toBe('zip-bytes')
    })

    it('ends the response with an error message when Body is not a stream', async () => {
      prismaMock.gm_users_data_request.findFirst.mockResolvedValueOnce({ id: 'u1' })
      s3SendMock.mockResolvedValueOnce({ Body: undefined })
      const response = await request(makeApp()).get('/gdpr-request/u1?code=abc')
      expect(response.text).toBe('Error: no stream returned')
    })

    it('returns 404 when the S3 fetch fails', async () => {
      prismaMock.gm_users_data_request.findFirst.mockResolvedValueOnce({ id: 'u1' })
      s3SendMock.mockRejectedValueOnce(new Error('not found'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const response = await request(makeApp()).get('/gdpr-request/u1?code=abc')
      expect(response.status).toBe(404)
      expect(response.body).toEqual({ error: 'invalid_uuid' })
      expect(errorSpy).toHaveBeenCalled()
    })
  })

  it('mounts the webhooks/v3/v6/steam sub-routers', () => {
    const mountedRouters = router.stack.filter((layer: any) => layer.name === 'router')
    expect(mountedRouters.length).toBe(4)
  })
})
vi.mock('@gmod/domain-user/privacy.js', () => ({ isErasureBlocked: vi.fn().mockResolvedValue(false) }))
