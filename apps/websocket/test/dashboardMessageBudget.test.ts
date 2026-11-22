import { describe, expect, it } from 'vitest'
import { createDashboardMessageBudget, DASHBOARD_MAX_MESSAGE_BYTES } from '../src/dashboardMessageBudget.js'
describe('dashboard socket message budget', () => {
  it('rejects large binary buffers and multibyte strings before parsing', () => {
    const budget = createDashboardMessageBudget()
    expect(budget.enter(Buffer.alloc(DASHBOARD_MAX_MESSAGE_BYTES + 1))).toBe('rejected')
    expect(budget.enter('é'.repeat(DASHBOARD_MAX_MESSAGE_BYTES))).toBe('rejected')
    expect(budget.enter('{}')).toBe('accepted')
  })
  it('bounds concurrent metadata operations and releases completed requests', () => {
    const budget = createDashboardMessageBudget()
    expect(budget.enter('{}')).toBe('accepted')
    expect(budget.enter('{}')).toBe('accepted')
    expect(budget.enter('{}')).toBe('busy')
    budget.release()
    expect(budget.enter('{}')).toBe('accepted')
  })
  it('limits message bursts and resets only at the next fixed time window', () => {
    let now = 0
    const budget = createDashboardMessageBudget(() => now)
    for (let i = 0; i < 30; i++) {
      expect(budget.enter('{}')).toBe('accepted')
      budget.release()
    }
    expect(budget.enter('{}')).toBe('rejected')
    now = 9999
    expect(budget.enter('{}')).toBe('rejected')
    now = 10000
    expect(budget.enter('{}')).toBe('accepted')
  })
})
