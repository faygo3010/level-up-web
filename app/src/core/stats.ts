import type { DateKey, LogEntry, MoneyDetails, TradeDetails, WorkoutDetails } from './types'

const inRange = (date: DateKey, from?: DateKey, to?: DateKey): boolean =>
  (from === undefined || date >= from) && (to === undefined || date <= to)

const ratio = (n: number, d: number): number => (d === 0 ? 0 : n / d)

export interface TradeStats {
  readonly count: number
  readonly wins: number
  readonly winRate: number
  readonly totalPnl: number
  /** Share of trades where you followed your plan. */
  readonly planAdherence: number
  readonly followed: { readonly count: number; readonly pnl: number }
  readonly broken: { readonly count: number; readonly pnl: number }
}

export function tradeStats(logs: readonly LogEntry[], from?: DateKey, to?: DateKey): TradeStats {
  const trades: TradeDetails[] = logs.flatMap((l) => (l.kind === 'trade' && inRange(l.date, from, to) ? [l.trade] : []))
  const sum = (ts: TradeDetails[]) => ts.reduce((s, t) => s + t.pnl, 0)
  const followed = trades.filter((t) => t.followedPlan)
  const broken = trades.filter((t) => !t.followedPlan)
  const wins = trades.filter((t) => t.pnl > 0).length

  return {
    count: trades.length,
    wins,
    winRate: ratio(wins, trades.length),
    totalPnl: sum(trades),
    planAdherence: ratio(followed.length, trades.length),
    followed: { count: followed.length, pnl: sum(followed) },
    broken: { count: broken.length, pnl: sum(broken) },
  }
}

export interface MoneySummary {
  readonly income: number
  readonly spending: number
  readonly net: number
  readonly byCategory: readonly { readonly category: string; readonly total: number }[]
}

/** Income and spending for a month ("YYYY-MM"). Spending categories sorted biggest first. */
export function moneySummary(logs: readonly LogEntry[], month: string): MoneySummary {
  const items: MoneyDetails[] = logs.flatMap((l) => (l.kind === 'money' && l.date.startsWith(month) ? [l.money] : []))
  const income = items.filter((m) => m.amount > 0).reduce((s, m) => s + m.amount, 0)
  const spent = items.filter((m) => m.amount < 0)
  const spending = spent.reduce((s, m) => s - m.amount, 0)

  const totals = spent.reduce<Record<string, number>>(
    (acc, m) => ({ ...acc, [m.category]: (acc[m.category] ?? 0) - m.amount }),
    {},
  )
  const byCategory = Object.entries(totals)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)

  return { income, spending, net: income - spending, byCategory }
}

export function workoutSummary(logs: readonly LogEntry[], from?: DateKey, to?: DateKey): { sessions: number; minutes: number } {
  const items: WorkoutDetails[] = logs.flatMap((l) => (l.kind === 'workout' && inRange(l.date, from, to) ? [l.workout] : []))
  return { sessions: items.length, minutes: items.reduce((s, w) => s + w.minutes, 0) }
}
