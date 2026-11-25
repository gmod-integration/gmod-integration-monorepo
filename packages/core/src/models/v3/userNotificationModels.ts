import prisma from '@gmod/infra-prisma'

export async function getUserNotifications(discordID: string) {
  const notifications = await prisma.gm_users_notifications.findMany({
    where: { discordID },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })
  return { notifications, unreadCount: notifications.filter((notification) => !notification.read).length }
}

export async function getUserNotificationCount(discordID: string) {
  return { unreadCount: await prisma.gm_users_notifications.count({ where: { discordID, read: false } }) }
}

export async function markUserNotificationRead(discordID: string, notificationID: string) {
  if (!/^[1-9]\d*$/.test(notificationID) || Number(notificationID) > 2147483647) {
    return { status: 400, body: { error: 'Invalid notification ID' } }
  }

  const updated = await prisma.gm_users_notifications.updateMany({
    where: { id: Number(notificationID), discordID },
    data: { read: true },
  })
  if (updated.count === 0) return { status: 404, body: { error: 'Notification not found' } }

  return { status: 200, body: await getUserNotificationCount(discordID) }
}

export async function markAllUserNotificationsRead(discordID: string) {
  await prisma.gm_users_notifications.updateMany({ where: { discordID, read: false }, data: { read: true } })
  return getUserNotificationCount(discordID)
}
