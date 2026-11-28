import { addDays, dateRange, weekdayOf } from './dates.js'
import type { AppState, DateKey, Routine } from './types.js'

export interface DayScore {
  readonly done: number
  readonly total: number
  /** null when nothing was scheduled (a rest day). */
  readonly score: number | null
}

export function scheduledRoutines(state: AppState, date: DateKey, areaId?: string): Routine[] {
  const day = weekdayOf(date)
  return state.routines.filter(
    (r) => !r.archived && r.days.includes(day) && (areaId === undefined || r.areaId === areaId),
  )
}

/**
 * How well you followed your system on a day: scheduled routines completed
 * plus playbook rules marked as kept, over everything that was expected.
 */
export function dayScore(state: AppState, date: DateKey, areaId?: string): DayScore {
  if (state.startedOn !== undefined && date < state.startedOn) return { done: 0, total: 0, score: null }
  const routines = scheduledRoutines(state, date, areaId)
  const completed = new Set(state.completions[date] ?? [])
  const rules = state.rules.filter((r) => !r.archived && (areaId === undefined || r.areaId === areaId))
  const checks = state.ruleChecks[date] ?? {}

  const done = routines.filter((r) => completed.has(r.id)).length + rules.filter((r) => checks[r.id] === true).length
  const total = routines.length + rules.length
  return { done, total, score: total === 0 ? null : done / total }
}

const passes = (state: AppState, date: DateKey): boolean | null => {
  const { score } = dayScore(state, date)
  return score === null ? null : score >= state.settings.streakThreshold
}

/** Max look-back so a streak calc can never loop forever. */
const STREAK_LIMIT = 3650

/** Consecutive passing days up to today. An unfinished today doesn't break it. */
export function currentStreak(state: AppState, on: DateKey): number {
  let streak = passes(state, on) === true ? 1 : 0
  let date = addDays(on, -1)
  for (let i = 0; i < STREAK_LIMIT; i++, date = addDays(date, -1)) {
    const result = passes(state, date)
    if (result === false) break
    if (result === true) streak++
    if (state.startedOn !== undefined && date < state.startedOn) break
    if (result === null && !hasAnyActivityBefore(state, date)) break
  }
  return streak
}

/** Stop walking back once we're before any routine or rule existed in practice. */
function hasAnyActivityBefore(state: AppState, date: DateKey): boolean {
  return Object.keys(state.completions).some((d) => d < date) || Object.keys(state.ruleChecks).some((d) => d < date)
}

export function bestStreak(state: AppState, from: DateKey, to: DateKey): number {
  let best = 0
  let run = 0
  for (const date of dateRange(from, to)) {
    const result = passes(state, date)
    if (result === true) run++
    if (result === false) run = 0
    best = Math.max(best, run)
  }
  return best
}

export interface HistoryPoint {
  readonly date: DateKey
  readonly score: number | null
}

/** Last n days of scores, oldest first. */
export function scoreHistory(state: AppState, on: DateKey, days: number, areaId?: string): HistoryPoint[] {
  return dateRange(addDays(on, -(days - 1)), on).map((date) => ({ date, score: dayScore(state, date, areaId).score }))
}

/** Average adherence for an area over the last n days; null if nothing was scheduled. */
export function areaAdherence(state: AppState, areaId: string, on: DateKey, days: number): number | null {
  const scores = scoreHistory(state, on, days, areaId)
    .map((p) => p.score)
    .filter((s): s is number => s !== null)
  return scores.length === 0 ? null : scores.reduce((a, b) => a + b, 0) / scores.length
}
