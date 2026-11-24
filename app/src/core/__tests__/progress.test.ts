import { goalProgress, sumInPeriod } from '../progress'
import { goal } from './fixtures'
import type { GoalEntry } from '../types'

const entry = (date: string, value: number, goalId = 'g1'): GoalEntry => ({
  id: `${goalId}-${date}-${value}`,
  goalId,
  date,
  value,
})

// 2026-11-25 is a Wednesday: day 3 of a Monday-start week.
const WED = '2026-11-25'

describe('sumInPeriod', () => {
  it('sums only entries for the goal inside the period', () => {
    const entries = [
      entry('2026-11-22', 5), // previous week (Sunday)
      entry('2026-11-23', 1),
      entry('2026-11-25', 2),
      entry('2026-11-24', 9, 'other'),
    ]
    expect(sumInPeriod(goal(), entries, WED, 1)).toBe(3)
  })
})

describe('goalProgress', () => {
  it('is done once an atLeast goal reaches its target', () => {
    const p = goalProgress(goal(), [entry('2026-11-23', 4)], WED, 1)
    expect(p).toMatchObject({ current: 4, target: 4, ratio: 1, status: 'done' })
  })

  it('is on track when ahead of the expected pace', () => {
    // 3/7 of the week elapsed -> expected 4 * 3/7 = 1.71
    const p = goalProgress(goal(), [entry('2026-11-23', 2)], WED, 1)
    expect(p.status).toBe('onTrack')
    expect(p.ratio).toBeCloseTo(0.5)
    expect(p.expected).toBeCloseTo(12 / 7)
  })

  it('is behind when below the expected pace', () => {
    const p = goalProgress(goal(), [entry('2026-11-23', 1)], WED, 1)
    expect(p.status).toBe('behind')
    expect(p.remaining).toBe(3)
  })

  it('caps ratio at 1 for atLeast goals', () => {
    expect(goalProgress(goal(), [entry(WED, 10)], WED, 1).ratio).toBe(1)
  })

  it('handles atMost goals as budgets', () => {
    const budget = goal({ direction: 'atMost', period: 'monthly', target: 300, unit: '£' })
    // 2026-11-10 = day 10 of 30 -> pace 100
    expect(goalProgress(budget, [entry('2026-11-02', 80)], '2026-11-10', 1).status).toBe('onTrack')
    expect(goalProgress(budget, [entry('2026-11-02', 150)], '2026-11-10', 1).status).toBe('behind')
    const over = goalProgress(budget, [entry('2026-11-02', 400)], '2026-11-10', 1)
    expect(over.status).toBe('over')
    expect(over.ratio).toBe(1)
    expect(over.remaining).toBe(0)
  })

  it('treats a zero target as complete rather than dividing by zero', () => {
    expect(goalProgress(goal({ target: 0 }), [], WED, 1)).toMatchObject({ ratio: 1, status: 'done' })
  })
})
