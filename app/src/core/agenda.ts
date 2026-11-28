import { dayScore, scheduledRoutines } from './adherence.js'
import { addDays, weekdayOf } from './dates.js'
import type { AppState, DateKey, Goal, GoalEntry, LogEntry, Routine, Rule } from './types.js'

/** A calendar month as "YYYY-MM". */
export type MonthKey = string

const pad = (n: number): string => String(n).padStart(2, '0')
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function parts(month: MonthKey): { y: number; m: number } {
  const [y, m] = month.split('-').map(Number)
  return { y: y ?? 1970, m: m ?? 1 }
}

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const { y, m } = parts(month)
  const index = y * 12 + (m - 1) + delta
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`
}

export function monthLabel(month: MonthKey): string {
  const { y, m } = parts(month)
  return `${MONTHS[m - 1]} ${y}`
}

export function weekdayLabels(weekStartsOn: 0 | 1): string[] {
  return [...WEEKDAYS.slice(weekStartsOn), ...WEEKDAYS.slice(0, weekStartsOn)]
}

/** Full weeks covering the month, padded with days from the months either side. */
export function monthGrid(month: MonthKey, weekStartsOn: 0 | 1): DateKey[][] {
  const first = `${month}-01`
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1)
  let day = addDays(first, -((weekdayOf(first) - weekStartsOn + 7) % 7))
  const weeks: DateKey[][] = []
  while (day <= last) {
    const week = Array.from({ length: 7 }, (_, i) => addDays(day, i))
    weeks.push(week)
    day = addDays(day, 7)
  }
  return weeks
}

export type DayWhen = 'past' | 'today' | 'future'

export interface DayAgenda {
  readonly date: DateKey
  readonly when: DayWhen
  /** 0-1 share of routines done and rules kept; null for rest days, future days and days before you started. */
  readonly score: number | null
  readonly routines: readonly { routine: Routine; done: boolean }[]
  /** kept: true / false, or null when not reviewed. */
  readonly rules: readonly { rule: Rule; kept: boolean | null }[]
  /** Newest first. */
  readonly logs: readonly LogEntry[]
  readonly goalEntries: readonly { entry: GoalEntry; goal: Goal }[]
}

const whenOf = (date: DateKey, today: DateKey): DayWhen => (date < today ? 'past' : date > today ? 'future' : 'today')

/** Everything about one day: what was planned, what got done, and what was logged. */
export function dayAgenda(state: AppState, date: DateKey, today: DateKey): DayAgenda {
  const when = whenOf(date, today)
  const done = new Set(state.completions[date] ?? [])
  const checks = state.ruleChecks[date] ?? {}
  const goals = new Map(state.goals.map((g) => [g.id, g]))
  return {
    date,
    when,
    score: when === 'future' ? null : dayScore(state, date).score,
    routines: scheduledRoutines(state, date).map((routine) => ({ routine, done: done.has(routine.id) })),
    rules: state.rules.filter((r) => !r.archived).map((rule) => ({ rule, kept: checks[rule.id] ?? null })),
    logs: state.logs.filter((l) => l.date === date).sort((a, b) => b.createdAt - a.createdAt),
    goalEntries: state.goalEntries.flatMap((entry) => {
      const goal = goals.get(entry.goalId)
      return entry.date === date && goal ? [{ entry, goal }] : []
    }),
  }
}

export interface DayDigest {
  readonly score: number | null
  readonly entries: number
  /** Net trading P&L that day, or null when no trades were logged. */
  readonly pnl: number | null
}

/** The little that fits in one cell of the month grid. */
export function dayDigest(state: AppState, date: DateKey, today: DateKey): DayDigest {
  const logs = state.logs.filter((l) => l.date === date)
  const trades = logs.flatMap((l) => (l.kind === 'trade' ? [l.trade.pnl] : []))
  return {
    score: date > today ? null : dayScore(state, date).score,
    entries: logs.length,
    pnl: trades.length ? trades.reduce((a, b) => a + b, 0) : null,
  }
}
