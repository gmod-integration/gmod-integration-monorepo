import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
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
    expect(container.querySelector('.loading-lg')).toBeInTheDocument()
  })

  it('shows the empty state when there are no notifications', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse({ notifications: [], unreadCount: 0 }))
    renderWithProviders(() => <Notifications />)
    await vi.waitFor(() => expect(screen.getByText('No notifications yet')).toBeInTheDocument())
  })

  it('falls back to an empty result set when the response is not ok', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse({}, false))
    renderWithProviders(() => <Notifications />)
    await vi.waitFor(() => expect(screen.getByText('No notifications yet')).toBeInTheDocument())
    expect(notificationCount()).toBe(0)
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
    ;(fetchAPI as Mock).mockResolvedValue(
      jsonResponse({ notifications: defaultNotifications(), unreadCount: 3 }),
    )
    renderWithProviders(() => <Notifications />)
    await waitForLoaded()

    expect(notificationCount()).toBe(3)
    expect(screen.getByText('3')).toBeInTheDocument() // badge next to the title

    const rows = screen.getAllByRole('row').slice(1) // skip header row
    // createdAt desc: FYI (04) > Careful (03) > All good (02) > Something broke (01)
    expect(rows[0]).toHaveTextContent('FYI')
    expect(rows[1]).toHaveTextContent('Careful')
    expect(rows[2]).toHaveTextContent('All good')
    expect(rows[3]).toHaveTextContent('Something broke')

    // badge classes: error -> badge-error, warning -> badge-warning, success/other -> badge-success
    expect(rows[3].querySelector('.badge-error')).toBeInTheDocument()
    expect(rows[1].querySelector('.badge-warning')).toBeInTheDocument()
    expect(rows[2].querySelector('.badge-success')).toBeInTheDocument()
    expect(rows[0].querySelector('.badge-success')).toBeInTheDocument() // 'info' type falls back to success

    // read row (Careful) is dimmed and shows the eye-slash icon instead of a clickable eye
    expect(rows[1].querySelector('.fa-eye-slash')).toBeInTheDocument()
    expect(rows[1].querySelector('.fa-eye')).not.toBeInTheDocument()
    expect(rows[0].querySelector('.fa-eye')).toBeInTheDocument()
  })

  it('shows the Mark All Read button only when there are unread notifications', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(
      jsonResponse({ notifications: defaultNotifications(), unreadCount: 3 }),
    )
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
    ;(fetchAPI as Mock).mockResolvedValue(
      jsonResponse({ notifications: defaultNotifications(), unreadCount: 3 }),
    )
    renderWithProviders(() => <Notifications />)
    await waitForLoaded()

    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse({ unreadCount: 2 }))
    const rows = screen.getAllByRole('row').slice(1)
    const eyeIcon = rows[3].querySelector('.fa-eye')! // "Something broke" row, unread
    fireEvent.click(eyeIcon)

    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith('/users/:discordID/notifications/1', 'PATCH'))
    await vi.waitFor(() => expect(notificationCount()).toBe(2))
    // `<For>` swaps in a fresh DOM node for the mutated item (new object reference), so the row
    // must be re-queried rather than reusing the pre-mutation `rows[3]` reference.
    await vi.waitFor(() =>
      expect(screen.getAllByRole('row').slice(1)[3].querySelector('.fa-eye-slash')).toBeInTheDocument(),
    )
  })

  it('falls back to a zero count when the mark-as-read response omits unreadCount', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(
      jsonResponse({ notifications: defaultNotifications(), unreadCount: 3 }),
    )
    renderWithProviders(() => <Notifications />)
    await waitForLoaded()

    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse({}))
    const rows = screen.getAllByRole('row').slice(1)
    fireEvent.click(rows[3].querySelector('.fa-eye')!)

    await vi.waitFor(() => expect(notificationCount()).toBe(0))
  })

  it('shows an error and leaves state unchanged when marking a single notification fails', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(
      jsonResponse({ notifications: defaultNotifications(), unreadCount: 3 }),
    )
    renderWithProviders(() => <Notifications />)
    await waitForLoaded()

    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse({}, false))
    const rows = screen.getAllByRole('row').slice(1)
    fireEvent.click(rows[3].querySelector('.fa-eye')!)

    await vi.waitFor(() => expect(Errors).toHaveBeenCalledWith('Failed to mark the notification as read'))
    expect(notificationCount()).toBe(3)
  })

  it('marks all notifications as read on button click', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(
      jsonResponse({ notifications: defaultNotifications(), unreadCount: 3 }),
    )
    renderWithProviders(() => <Notifications />)
    await waitForLoaded()

    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse({ unreadCount: 0 }))
    fireEvent.click(screen.getByTitle('Mark All as Read'))

    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith('/users/:discordID/notifications/mark-all-read', 'PATCH'),
    )
    await vi.waitFor(() => expect(notificationCount()).toBe(0))
    await vi.waitFor(() => expect(screen.queryAllByRole('row').slice(1).every(
      (row) => row.querySelector('.fa-eye-slash'),
    )).toBe(true))
  })

  it('shows an error when marking all as read responds not ok', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(
      jsonResponse({ notifications: defaultNotifications(), unreadCount: 3 }),
    )
    renderWithProviders(() => <Notifications />)
    await waitForLoaded()

    ;(fetchAPI as Mock).mockResolvedValue(jsonResponse({}, false))
    fireEvent.click(screen.getByTitle('Mark All as Read'))

    await vi.waitFor(() => expect(Errors).toHaveBeenCalledWith('Failed to mark all notifications as read'))
    expect(notificationCount()).toBe(3)
  })

  it('shows an error and logs when marking all as read rejects', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(
      jsonResponse({ notifications: defaultNotifications(), unreadCount: 3 }),
    )
    renderWithProviders(() => <Notifications />)
    await waitForLoaded()

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(fetchAPI as Mock).mockRejectedValue(new Error('network down'))
    fireEvent.click(screen.getByTitle('Mark All as Read'))

    await vi.waitFor(() => expect(Errors).toHaveBeenCalledWith('Failed to mark all notifications as read'))
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error in markAllAsRead:', expect.any(Error))
  })
})
