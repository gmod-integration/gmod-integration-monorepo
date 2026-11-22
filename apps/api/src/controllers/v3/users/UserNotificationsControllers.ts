import type { Request, Response } from 'express'
import {
  getUserNotifications,
  getUserNotificationCount,
  markUserNotificationRead,
  markAllUserNotificationsRead,
} from '@gmod/core/models/v3/userNotificationModels.js'
import { getSingleParam } from '@/utils/requestParams.js'

export async function getNotifications(req: Request, res: Response) {
  return res.json(await getUserNotifications(getSingleParam(req.params.discordID)))
}

export async function getNotificationCount(req: Request, res: Response) {
  return res.json(await getUserNotificationCount(getSingleParam(req.params.discordID)))
}

export async function patchNotification(req: Request, res: Response) {
  const result = await markUserNotificationRead(
    getSingleParam(req.params.discordID),
    getSingleParam(req.params.notificationID),
  )
  return res.status(result.status).json(result.body)
}

export async function patchAllNotifications(req: Request, res: Response) {
  return res.json(await markAllUserNotificationsRead(getSingleParam(req.params.discordID)))
}
