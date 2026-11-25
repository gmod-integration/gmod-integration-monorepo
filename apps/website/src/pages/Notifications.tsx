import { AsyncState, Button, DateTime, Icon, IconButton, StatusBadge } from '../components/ui/index.js'
import { type Component, createResource, createSignal, For, Show } from 'solid-js'
import Pagination from '../components/Pagination.js'
import { createListPagination } from '../hooks/createListPagination.js'
import DashboardMiddleware from '../middleware/DashboardMiddleware.js'
import { useI18n } from '../i18n.js'
import { Errors } from '../components/layout/Errors.js'
import { fetchAPI } from '../utils/api.js'
import { notificationCount, updateNotificationCount } from '../utils/notificationStore.js'
import { createAsyncAction } from '../hooks/createAsyncAction.js'

type Notification = { id: number; type: string; message: string; read: boolean; createdAt: string }

const notificationAppearance = (type: string) => {
  switch (type) {
    case 'error':
      return { tone: 'danger', icon: 'circle-alert' } as const
    case 'warning':
      return { tone: 'warning', icon: 'triangle-alert' } as const
    case 'success':
      return { tone: 'success', icon: 'circle-check' } as const
    case 'info':
      return { tone: 'info', icon: 'info' } as const
    default:
      return { tone: 'neutral', icon: 'tag' } as const
  }
}

const Notifications: Component = () => {
  const { t } = useI18n()
  const [activeID, setActiveID] = createSignal<number>()
  const action = createAsyncAction({
    errorMessage: () =>
      t(
        'notifications.action_error',
        'The read status could not be updated. Refresh the list to check it before trying again.',
      ),
  })
  const [userNotifications, { mutate: mutateUserNotifications, refetch: refetchNotifications }] = createResource(
    'userNotifications',
    async (): Promise<Notification[]> => {
      const response = await fetchAPI('/users/:discordID/notifications', 'GET')
      if (!response.ok) throw new Error('Notifications request failed')
      const json = await response.json()
      updateNotificationCount(json.unreadCount || 0)
      const notifications = json.notifications || json
      return Array.isArray(notifications)
        ? [...notifications].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        : []
    },
  )

  const pagination = createListPagination(() => (!userNotifications.error ? userNotifications() : undefined))

  async function setNotificationsAsRead(id: number) {
    if (action.pending()) return
    setActiveID(id)
    await action.run(async () => {
      try {
        const response = await fetchAPI(`/users/:discordID/notifications/${id}`, 'PATCH')
        if (!response.ok) throw new Error('Notification update failed')
        const json = await response.json()
        updateNotificationCount(json.unreadCount || 0)
        mutateUserNotifications((previous) =>
          (previous || []).map((notification) =>
            notification.id === id ? { ...notification, read: true } : notification,
          ),
        )
      } catch (error) {
        Errors(t('notifications.mark_as_read_error', 'Failed to mark the notification as read'))
        throw error
      }
    })
  }

  async function markAllAsRead() {
    if (action.pending()) return
    setActiveID(undefined)
    await action.run(async () => {
      try {
        const response = await fetchAPI('/users/:discordID/notifications/mark-all-read', 'PATCH')
        if (!response.ok) throw new Error('Notifications update failed')
        const json = await response.json()
        updateNotificationCount(json.unreadCount || 0)
        mutateUserNotifications((previous) => (previous || []).map((notification) => ({ ...notification, read: true })))
      } catch (error) {
        Errors(t('notifications.mark_all_read_error', 'Failed to mark all notifications as read'))
        throw error
      }
    })
  }

  return (
    <>
      <DashboardMiddleware />
      <div class="public-page notifications-page mx-auto flex w-full max-w-5xl flex-col gap-7 px-4 py-8 sm:px-8 sm:py-12">
        <header class="public-page-heading flex flex-wrap items-start justify-between gap-5">
          <div class="flex flex-col gap-3">
            <span class="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
              <Icon name="bell" size={16} />
              {t('main.account', 'Account')}
            </span>
            <div class="flex items-center gap-3">
              <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">
                {t('notifications.title', 'Notifications')}
              </h1>
              <Show when={notificationCount() > 0}>
                <StatusBadge tone="info" size="sm">
                  {notificationCount()}
                </StatusBadge>
              </Show>
            </div>
            <p class="max-w-2xl text-sm leading-relaxed text-base-content/55">
              {t(
                'notifications.description',
                'Read updates about your account. Marking a notification as read clears its unread indicator and keeps the message in this list.',
              )}
            </p>
          </div>
          <Show when={notificationCount() > 0}>
            <Button
              variant="secondary"
              loading={action.pending() && activeID() === undefined}
              disabled={action.pending()}
              onClick={markAllAsRead}
              title={t('notifications.mark_all_read', 'Mark All as Read')}
            >
              <Icon name="check-check" size={16} />
              {t('notifications.mark_all_read', 'Mark All Read')}
            </Button>
          </Show>
        </header>

        <Show when={action.error()}>
          <p role="alert" class="rounded-xl border border-error/15 bg-error/5 px-4 py-3 text-sm text-error">
            {action.error()}
          </p>
        </Show>
        <AsyncState
          loading={userNotifications.loading}
          error={userNotifications.error}
          onRetry={() => refetchNotifications()}
        >
          <Show
            when={userNotifications()?.length}
            fallback={
              <div class="public-card flex flex-col items-center gap-4 rounded-2xl border border-base-content/10 bg-base-100 px-6 py-14 text-center">
                <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Icon name="bell-off" size={25} />
                </span>
                <p class="text-sm text-base-content/55">
                  {t('notifications.no_notifications', 'No notifications yet')}
                </p>
              </div>
            }
          >
            <ul
              class="notification-list overflow-hidden rounded-2xl border border-base-content/10 bg-base-100"
              aria-label={t('notifications.title', 'Notifications')}
            >
              <For each={pagination.items()}>
                {(notification) => (
                  <li
                    class="notification-item flex min-w-0 gap-4 border-b border-base-content/8 p-5 last:border-b-0 sm:p-6"
                    data-read={notification.read}
                    data-tone={notification.type}
                  >
                    <span
                      class={`notification-item-icon mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${notification.read ? 'bg-base-200/40 text-base-content/35' : 'bg-primary/10 text-primary'}`}
                    >
                      <Icon name={notificationAppearance(notification.type).icon} size={19} />
                    </span>
                    <div class="notification-item-copy flex min-w-0 flex-1 flex-col gap-2">
                      <div class="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          tone={notificationAppearance(notification.type).tone}
                          icon={notificationAppearance(notification.type).icon}
                        >
                          {notification.type === 'error'
                            ? t('notifications.types.error', 'Error')
                            : notification.type === 'warning'
                              ? t('notifications.types.warning', 'Warning')
                              : notification.type === 'success'
                                ? t('notifications.types.success', 'Success')
                                : notification.type === 'info'
                                  ? t('notifications.types.info', 'Information')
                                  : notification.type}
                        </StatusBadge>
                        <DateTime value={notification.createdAt} class="text-xs text-base-content/45" />
                      </div>
                      <p
                        class={`break-words text-sm leading-relaxed ${notification.read ? 'text-base-content/50' : 'text-base-content/90'}`}
                      >
                        {notification.message}
                      </p>
                    </div>
                    <div class="notification-actions flex shrink-0 items-start pt-1">
                      <Show
                        when={!notification.read}
                        fallback={
                          <span class="p-2 text-base-content/30" title={t('notifications.read', 'Read')}>
                            <Icon name="eye-off" size={17} />
                            <span class="sr-only">{t('notifications.read', 'Read')}</span>
                          </span>
                        }
                      >
                        <IconButton
                          icon="eye"
                          label={t('notifications.mark_as_read', 'Mark as Read')}
                          loading={action.pending() && activeID() === notification.id}
                          disabled={action.pending()}
                          onClick={() => setNotificationsAsRead(notification.id)}
                        />
                      </Show>
                    </div>
                  </li>
                )}
              </For>
            </ul>
            <Show when={pagination.visible()}>
              <Pagination
                standalone
                query={pagination.query()}
                total={pagination.total()}
                onChange={pagination.onChange}
              />
            </Show>
          </Show>
        </AsyncState>
      </div>
    </>
  )
}

export default Notifications
