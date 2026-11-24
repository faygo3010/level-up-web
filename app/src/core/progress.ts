import { dateRange, periodRange } from './dates'
import type { DateKey, Goal, GoalEntry } from './types'

export type GoalStatus = 'done' | 'onTrack' | 'behind' | 'over'

export interface GoalProgress {
  readonly current: number
  readonly target: number
  /** 0-1, for drawing the bar. */
  readonly ratio: number
  /** Where you should be by today if progressing evenly through the period. */
  readonly expected: number
  /** atLeast: amount still needed. atMost: budget left. Never negative. */
  readonly remaining: number
  readonly status: GoalStatus
}

export function sumInPeriod(goal: Goal, entries: readonly GoalEntry[], on: DateKey, weekStartsOn: 0 | 1): number {
  const { start, end } = periodRange(on, goal.period, weekStartsOn)
  return entries
    .filter((e) => e.goalId === goal.id && e.date >= start && e.date <= end)
    .reduce((sum, e) => sum + e.value, 0)
}

function elapsedFraction(goal: Goal, on: DateKey, weekStartsOn: 0 | 1): number {
  const { start, end } = periodRange(on, goal.period, weekStartsOn)
  const total = dateRange(start, end).length
  const elapsed = dateRange(start, on).length
  return elapsed / total
}

export function goalProgress(goal: Goal, entries: readonly GoalEntry[], on: DateKey, weekStartsOn: 0 | 1): GoalProgress {
  const current = sumInPeriod(goal, entries, on, weekStartsOn)
  const { target } = goal
  const expected = target * elapsedFraction(goal, on, weekStartsOn)
  const ratio = target <= 0 ? 1 : Math.min(current / target, 1)
  const remaining = Math.max(target - current, 0)

  if (goal.direction === 'atMost') {
    const status: GoalStatus = current > target ? 'over' : current > expected ? 'behind' : 'onTrack'
    return { current, target, ratio, expected, remaining, status }
  }

  const status: GoalStatus = current >= target ? 'done' : current >= expected ? 'onTrack' : 'behind'
  return { current, target, ratio, expected, remaining, status }
}
