import express from 'express'
import {
  AdminBugsQuerySchema,
  AdminConnectionsQuerySchema,
  AdminErrorsQuerySchema,
} from '@gmod/schema/admin/AdminMonitoringSchema.js'
import asyncHandler from '../../middleware/asyncHandler.js'
import type { z } from 'zod'

// Mounted inside adminRoutes, after its developer-only session middleware.
const router = express.Router()
const parse = <T>(schema: z.ZodType<T>, input: unknown): T => {
  const result = schema.safeParse(input)
  if (!result.success)
    throw Object.assign(new Error('Check the monitoring filters.'), {
      name: 'AdminDashboardError',
      status: 400,
      code: 'invalid_request',
    })
  return result.data
}
router.get(
  '/connections',
  asyncHandler(async (req, res) => {
    const query = parse(AdminConnectionsQuerySchema, req.query)
    const { listAdminConnections } = await import('@gmod/core/models/v6/adminMonitoring.js')
    res.json(await listAdminConnections(query))
  }),
)
router.get(
  '/errors',
  asyncHandler(async (req, res) => {
    const query = parse(AdminErrorsQuerySchema, req.query)
    const { listAdminErrors } = await import('@gmod/core/models/v6/adminMonitoring.js')
    res.json(await listAdminErrors(query))
  }),
)
router.get(
  '/bugs',
  asyncHandler(async (req, res) => {
    const query = parse(AdminBugsQuerySchema, req.query)
    const { listAdminBugs } = await import('@gmod/core/models/v6/adminMonitoring.js')
    res.json(await listAdminBugs(query))
  }),
)
export default router
