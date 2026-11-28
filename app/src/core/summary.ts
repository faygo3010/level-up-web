import { scoreHistory } from './adherence.js'
import { addDays, dateRange } from './dates.js'
import { goalProgress } from './progress.js'
import { netByCategory, tradeStats } from './stats.js'
import type { AppState, DateKey } from './types.js'

/** The numbers behind "how is my week going?", in one place. */
export function weekSummary(state: AppState, today: DateKey) {
  const start = addDays(today, -6)
  const avg = (end: DateKey) => {
    const s = scoreHistory(state, end, 7).map((h) => h.score).filter((x): x is number => x !== null)
    return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null
  }
  const days = dateRange(start, today)
  const rulesBroken = days.reduce((n, d) => n + Object.values(state.ruleChecks[d] ?? {}).filter((k) => k === false).length, 0)
  const spent = netByCategory(state.logs.flatMap((l) => (l.kind === 'money' && l.date >= start && l.date <= today ? [l.money] : []))).spending
  const budgetGoal = state.goals.find((g) => !g.archived && g.direction === 'atMost' && g.tracks === 'spending')
  const budget = budgetGoal && budgetGoal.target > 0
    ? { title: budgetGoal.title, used: goalProgress(budgetGoal, state.goalEntries, today, state.settings.weekStartsOn, state.logs).current / budgetGoal.target }
    : null
  return { adherence: avg(today), previous: avg(addDays(today, -7)), rulesBroken, trades: tradeStats(state.logs, start, today), spent, budget }
}

