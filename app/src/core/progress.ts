import { dateRange, periodRange } from './dates'
import type { DateKey, Goal, GoalEntry, LogEntry } from './types'

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

/** How much one journal entry contributes to a goal that tracks the journal. */
function journalValue(goal: Goal, l: LogEntry): number {
  switch (goal.tracks) {
    case 'spending':
      return l.kind === 'money' && l.money.amount < 0 ? -l.money.amount : 0
    case 'income':
      return l.kind === 'money' && l.money.amount > 0 ? l.money.amount : 0
    case 'workouts':
      return l.kind === 'workout' ? 1 : 0
    case 'workoutMinutes':
      return l.kind === 'workout' ? l.workout.minutes : 0
    case 'trades':
      return l.kind === 'trade' ? 1 : 0
    case 'tradePnl':
      return l.kind === 'trade' ? l.trade.pnl : 0
    default:
      return 0
  }
}

export function sumInPeriod(goal: Goal, entries: readonly GoalEntry[], on: DateKey, weekStartsOn: 0 | 1, logs: readonly LogEntry[] = []): number {
  const { start, end } = periodRange(on, goal.period, weekStartsOn)
  const inPeriod = (d: DateKey) => d >= start && d <= end
  const manual = entries.filter((e) => e.goalId === goal.id && inPeriod(e.date)).reduce((sum, e) => sum + e.value, 0)
  if (!goal.tracks) return manual
  const fromJournal = logs.filter((l) => l.areaId === goal.areaId && inPeriod(l.date)).reduce((sum, l) => sum + journalValue(goal, l), 0)
  return manual + fromJournal
}

function elapsedFraction(goal: Goal, on: DateKey, weekStartsOn: 0 | 1): number {
  const { start, end } = periodRange(on, goal.period, weekStartsOn)
  const total = dateRange(start, end).length
  const elapsed = dateRange(start, on).length
  return elapsed / total
}

export function goalProgress(
  goal: Goal,
  entries: readonly GoalEntry[],
  on: DateKey,
  weekStartsOn: 0 | 1,
  logs: readonly LogEntry[] = [],
): GoalProgress {
  const current = sumInPeriod(goal, entries, on, weekStartsOn, logs)
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
