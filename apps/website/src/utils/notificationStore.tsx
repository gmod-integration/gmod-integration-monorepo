import { createSignal } from 'solid-js'

// Global notification count store
const [notificationCount, setNotificationCount] = createSignal(0)

// Function to update notification count
export const updateNotificationCount = (count: number) => {
  setNotificationCount(count)
}

// Function to get current notification count
export const getNotificationCount = () => notificationCount()

// Export the signal for reactive updates
export { notificationCount }

// Function to decrement notification count (when marking as read)
export const decrementNotificationCount = () => {
  setNotificationCount(Math.max(0, notificationCount() - 1))
}

// Function to increment notification count (when creating new notification)
export const incrementNotificationCount = () => {
  setNotificationCount(notificationCount() + 1)
}
