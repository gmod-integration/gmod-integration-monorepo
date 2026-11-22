import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { renderWithProviders } from '../testUtils.js'
import { fetchAPI } from '../../src/utils/api.js'
import { Errors } from '../../src/components/layout/Errors.js'
import { setIsLogged } from '../../src/utils/event.js'
import { notificationCount, updateNotificationCount } from '../../src/utils/notificationStore.js'
import Notifications from '../../src/pages/Notifications.js'

vi.mock('../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

vi.mock('../../src/components/layout/Errors.js', () => ({
  Errors: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function jsonResponse(data: unknown, ok = true) {
  return { ok, json: async () => data } as Response
}

function defaultNotifications() {
  return [
    { id: 1, type: 'error', message: 'Something broke', read: false, createdAt: '2024-01-01T00:00:00.000Z' },
    { id: 2, type: 'warning', message: 'Careful', read: true, createdAt: '2024-01-03T00:00:00.000Z' },
    { id: 3, type: 'success', message: 'All good', read: false, createdAt: '2024-01-02T00:00:00.000Z' },
    { id: 4, type: 'info', message: 'FYI', read: false, createdAt: '2024-01-04T00:00:00.000Z' },
  ]
}

async function waitForLoaded() {
  await vi.waitFor(() => expect(screen.queryByText('Careful')).toBeInTheDocument())
}

describe('pages/Notifications.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setIsLogged(true)
    ;(fetchAPI as Mock).mockReset()
    ;(Errors as Mock).mockReset()
    updateNotificationCount(0)
  })

  it('shows a loading indicator while the notifications resource is loading', () => {
    ;(fetchAPI as Mock).mockReturnValue(new Promise(() => {}))
    const { container } = renderWithProviders(() => <Notifications />)
    expect(container.querySelector('[role="status"]')).toBeInTheDocument()
  })

  it('shows the empty state when there are no notifications', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse({ notifications: [], unreadCount: 0 }))
    renderWithProviders(() => <Notifications />)
    await vi.waitFor(() => expect(screen.getByText('No notifications yet')).toBeInTheDocument())
  })

  it('shows a recoverable request error instead of presenting it as an empty inbox', async () => {
    ;(fetchAPI as Mock)
      .mockResolvedValueOnce(jsonResponse({}, false))
      .mockResolvedValueOnce(jsonResponse({ notifications: defaultNotifications(), unreadCount: 3 }))
    renderWithProviders(() => <Notifications />)
    await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unable to load this content.'))
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitForLoaded()
    expect(notificationCount()).toBe(3)
  })

  it('falls back to an empty list when json.notifications is present but not an array', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse({ notifications: { not: 'an array' }, unreadCount: 0 }))
    renderWithProviders(() => <Notifications />)
    await vi.waitFor(() => expect(screen.getByText('No notifications yet')).toBeInTheDocument())
  })

  it('accepts a bare array response body (no notifications/unreadCount wrapper)', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse(defaultNotifications()))
    renderWithProviders(() => <Notifications />)
    await waitForLoaded()
    expect(screen.getByText('Something broke')).toBeInTheDocument()
  })

  it('sorts notifications by createdAt descending, updates the count, and renders type badges', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse({ notifications: defaultNotifications(), unreadCount: 3 }))
    renderWithProviders(() => <Notifications />)
    await waitForLoaded()

    expect(notificationCount()).toBe(3)
    expect(screen.getByText('3')).toBeInTheDocument() // badge next to the title

    const rows = screen.getAllByRole('listitem')
    // createdAt desc: FYI (04) > Careful (03) > All good (02) > Something broke (01)
    expect(rows[0]).toHaveTextContent('FYI')
    expect(rows[1]).toHaveTextContent('Careful')
    expect(rows[2]).toHaveTextContent('All good')
    expect(rows[3]).toHaveTextContent('Something broke')

    for (const [row, label, tone, icon] of [
      [3, 'Error', 'danger', 'circle-alert'],
      [1, 'Warning', 'warning', 'triangle-alert'],
      [2, 'Success', 'success', 'circle-check'],
      [0, 'Information', 'info', 'info'],
    ] as const) {
      const badge = within(rows[row]).getByText(label).closest('[data-tone]')!
      expect(badge).toHaveAttribute('data-tone', tone)
      expect(badge.querySelector(`svg[data-icon="${icon}"]`)).toBeInTheDocument()
    }

    // read row (Careful) is dimmed and shows the eye-slash icon instead of a clickable eye
    expect(rows[1].querySelector('svg[data-icon="eye-off"]')).toBeInTheDocument()
    expect(rows[1].querySelector('svg[data-icon="eye"]')).not.toBeInTheDocument()
    expect(rows[0].querySelector('svg[data-icon="eye"]')).toBeInTheDocument()
  })

  it('keeps unknown notification types neutral and preserves their supplied label', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(
      jsonResponse({
        notifications: [
          { id: 8, type: 'custom-event', message: 'Custom update', read: true, createdAt: '2024-01-01T00:00:00.000Z' },
        ],
        unreadCount: 0,
      }),
    )
    renderWithProviders(() => <Notifications />)
    await vi.waitFor(() => expect(screen.getByText('Custom update')).toBeInTheDocument())
    const badge = screen.getByText('custom-event').closest('[data-tone]')!
    expect(badge).toHaveAttribute('data-tone', 'neutral')
    expect(badge.querySelector('svg[data-icon="tag"]')).toBeInTheDocument()
  })

  it('shows the Mark All Read button only when there are unread notifications', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse({ notifications: defaultNotifications(), unreadCount: 3 }))
    renderWithProviders(() => <Notifications />)
    await waitForLoaded()
    expect(screen.getByTitle('Mark All as Read')).toBeInTheDocument()
  })

  it('hides the count badge and Mark All Read button when the count is zero', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse({ notifications: [], unreadCount: 0 }))
    renderWithProviders(() => <Notifications />)
    await vi.waitFor(() => expect(screen.getByText('No notifications yet')).toBeInTheDocument())
    expect(screen.queryByTitle('Mark All as Read')).not.toBeInTheDocument()
  })

  it('marks a single notification as read on icon click', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse({ notifications: defaultNotifications(), unreadCount: 3 }))
    renderWithProviders(() => <Notifications />)
    await waitForLoaded()

    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse({ unreadCount: 2 }))
    const rows = screen.getAllByRole('listitem')
    const eyeIcon = rows[3].querySelector('svg[data-icon="eye"]')! // "Something broke" row, unread
    fireEvent.click(eyeIcon)

    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith('/users/:discordID/notifications/1', 'PATCH'))
    await vi.waitFor(() => expect(notificationCount()).toBe(2))
    // `<For>` swaps in a fresh DOM node for the mutated item (new object reference), so the row
    // must be re-queried rather than reusing the pre-mutation `rows[3]` reference.
    await vi.waitFor(() =>
      expect(screen.getAllByRole('listitem')[3].querySelector('svg[data-icon="eye-off"]')).toBeInTheDocument(),
    )
  })

  it('disables repeated read actions while the request is pending and updates only after success', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse({ notifications: defaultNotifications(), unreadCount: 3 }))
    renderWithProviders(() => <Notifications />)
    await waitForLoaded()
    let resolve!: (value: Response) => void
    ;(fetchAPI as Mock).mockReturnValue(new Promise<Response>((done) => (resolve = done)))
    const item = screen.getByText('Something broke').closest('li')!
    const button = item.querySelector('button')!
    await fireEvent.click(button)
    expect(button).toBeDisabled()
    expect(notificationCount()).toBe(3)
    await fireEvent.click(button)
    expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'PATCH')).toHaveLength(1)
    resolve(jsonResponse({ unreadCount: 2 }))
    await vi.waitFor(() => expect(notificationCount()).toBe(2))
    expect(screen.getByText('Something broke').closest('li')).toHaveAttribute('data-read', 'true')
  })

  it('falls back to a zero count when the mark-as-read response omits unreadCount', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse({ notifications: defaultNotifications(), unreadCount: 3 }))
    renderWithProviders(() => <Notifications />)
    await waitForLoaded()

    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse({}))
    const rows = screen.getAllByRole('listitem')
    fireEvent.click(rows[3].querySelector('svg[data-icon="eye"]')!)

    await vi.waitFor(() => expect(notificationCount()).toBe(0))
  })

  it('shows an error and leaves state unchanged when marking a single notification fails', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse({ notifications: defaultNotifications(), unreadCount: 3 }))
    renderWithProviders(() => <Notifications />)
    await waitForLoaded()

    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse({}, false))
    const rows = screen.getAllByRole('listitem')
    fireEvent.click(rows[3].querySelector('svg[data-icon="eye"]')!)

    await vi.waitFor(() => expect(Errors).toHaveBeenCalledWith('Failed to mark the notification as read'))
    expect(notificationCount()).toBe(3)
  })

  it('paginates messages while mark-all-read updates notifications on every page', async () => {
    const notifications = Array.from({ length: 26 }, (_, index) => ({
      id: index + 1,
      type: 'info',
      message: `Notification ${index + 1}`,
      read: false,
      createdAt: new Date(Date.UTC(2024, 0, 1, 0, index)).toISOString(),
    }))
    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse({ notifications, unreadCount: 26 }))
    renderWithProviders(() => <Notifications />)
    await vi.waitFor(() => expect(screen.getByText('Notification 26')).toBeInTheDocument())
    expect(screen.getAllByRole('listitem')).toHaveLength(25)
    expect(screen.queryByText('Notification 1')).not.toBeInTheDocument()
    const pagination = within(screen.getByRole('navigation', { name: 'Pagination' }))
    await fireEvent.click(pagination.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('Notification 1')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse({ unreadCount: 0 }))
    await fireEvent.click(screen.getByTitle('Mark All as Read'))
    await vi.waitFor(() => expect(notificationCount()).toBe(0))
    expect(screen.getByText('Notification 1').closest('li')).toHaveAttribute('data-read', 'true')
    await fireEvent.click(pagination.getByRole('button', { name: 'Previous page' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(25)
    expect(screen.queryAllByRole('button', { name: 'Mark as Read' })).toHaveLength(0)
    expect(screen.getAllByRole('listitem').every((item) => item.dataset.read === 'true')).toBe(true)
    expect(fetchAPI).toHaveBeenLastCalledWith('/users/:discordID/notifications/mark-all-read', 'PATCH')
  })

  it('marks all notifications as read on button click', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse({ notifications: defaultNotifications(), unreadCount: 3 }))
    renderWithProviders(() => <Notifications />)
    await waitForLoaded()

    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse({ unreadCount: 0 }))
    fireEvent.click(screen.getByTitle('Mark All as Read'))

    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith('/users/:discordID/notifications/mark-all-read', 'PATCH'),
    )
    await vi.waitFor(() => expect(notificationCount()).toBe(0))
    await vi.waitFor(() =>
      expect(screen.queryAllByRole('listitem').every((row) => row.querySelector('svg[data-icon="eye-off"]'))).toBe(
        true,
      ),
    )
  })

  it('shows an error when marking all as read responds not ok', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse({ notifications: defaultNotifications(), unreadCount: 3 }))
    renderWithProviders(() => <Notifications />)
    await waitForLoaded()

    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse({}, false))
    fireEvent.click(screen.getByTitle('Mark All as Read'))

    await vi.waitFor(() => expect(Errors).toHaveBeenCalledWith('Failed to mark all notifications as read'))
    expect(notificationCount()).toBe(3)
  })

  it('shows an inline error and preserves unread items when marking all as read rejects', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse({ notifications: defaultNotifications(), unreadCount: 3 }))
    renderWithProviders(() => <Notifications />)
    await waitForLoaded()

    ;(fetchAPI as Mock).mockRejectedValue(new Error('network down'))
    fireEvent.click(screen.getByTitle('Mark All as Read'))

    await vi.waitFor(() => expect(Errors).toHaveBeenCalledWith('Failed to mark all notifications as read'))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The read status could not be updated. Refresh the list to check it before trying again.',
    )
    expect(notificationCount()).toBe(3)
  })
})
