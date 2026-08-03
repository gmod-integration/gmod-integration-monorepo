import { beforeEach, describe, expect, it } from 'vitest'
import {
  decrementNotificationCount,
  getNotificationCount,
  incrementNotificationCount,
  updateNotificationCount,
} from '../../src/utils/notificationStore.js'

describe('utils/notificationStore.tsx', () => {
  beforeEach(() => {
    updateNotificationCount(0)
  })

  it('updates and reads back the count', () => {
    updateNotificationCount(5)
    expect(getNotificationCount()).toBe(5)
  })

  it('increments the count', () => {
    updateNotificationCount(2)
    incrementNotificationCount()
    expect(getNotificationCount()).toBe(3)
  })

  it('decrements the count', () => {
    updateNotificationCount(2)
    decrementNotificationCount()
    expect(getNotificationCount()).toBe(1)
  })

  it('never decrements below zero', () => {
    updateNotificationCount(0)
    decrementNotificationCount()
    expect(getNotificationCount()).toBe(0)
  })
})
