import type { DateKey, LogEntry, MoneyDetails, TradeDetails, WorkoutDetails } from './types.js'

const inRange = (date: DateKey, from?: DateKey, to?: DateKey): boolean =>
  (from === undefined || date >= from) && (to === undefined || date <= to)

const ratio = (n: number, d: number): number => (d === 0 ? 0 : n / d)

export interface TradeStats {
  readonly count: number
  readonly wins: number
  readonly losses: number
  /** Trades with P&L exactly 0. */
  readonly breakeven: number
  readonly winRate: number
  readonly totalPnl: number
  /** Average winning trade (0 if none). */
  readonly avgWin: number
  /** Average losing trade, negative (0 if none). */
  readonly avgLoss: number
  /** Average P&L per trade. */
  readonly expectancy: number
  /** Share of trades where you followed your plan. */
  readonly planAdherence: number
  readonly followed: { readonly count: number; readonly pnl: number }
  readonly broken: { readonly count: number; readonly pnl: number }
}

/** Round to pennies so sums like 0.1 + 0.2 don't leak float noise. */
const cents = (n: number) => Math.round(n * 100) / 100
const mean = (xs: number[]) => (xs.length ? cents(xs.reduce((a, b) => a + b, 0) / xs.length) : 0)

export function tradeStats(logs: readonly LogEntry[], from?: DateKey, to?: DateKey): TradeStats {
  const trades: TradeDetails[] = logs.flatMap((l) => (l.kind === 'trade' && inRange(l.date, from, to) ? [l.trade] : []))
  const sum = (ts: TradeDetails[]) => cents(ts.reduce((s, t) => s + t.pnl, 0))
  const followed = trades.filter((t) => t.followedPlan)
  const broken = trades.filter((t) => !t.followedPlan)
  const wins = trades.filter((t) => t.pnl > 0).map((t) => t.pnl)
  const losses = trades.filter((t) => t.pnl < 0).map((t) => t.pnl)

  return {
    count: trades.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: trades.length - wins.length - losses.length,
    winRate: ratio(wins.length, trades.length),
    totalPnl: sum(trades),
    avgWin: mean(wins),
    avgLoss: mean(losses),
    expectancy: mean(trades.map((t) => t.pnl)),
    planAdherence: ratio(followed.length, trades.length),
    followed: { count: followed.length, pnl: sum(followed) },
    broken: { count: broken.length, pnl: sum(broken) },
  }
}

/**
 * Net money per category (case-insensitive), so a refund reduces spending in
 * its category instead of counting as income. Categories that net negative are
 * spending; those that net positive are income.
 */
export function netByCategory(items: readonly MoneyDetails[]): { spending: number; income: number; byCategory: { category: string; total: number }[] } {
  const net = new Map<string, number>()
  for (const m of items) {
    const key = m.category.trim().toLowerCase() || 'other'
    net.set(key, (net.get(key) ?? 0) + m.amount)
  }
  const entries = [...net.entries()].map(([category, total]) => [category, cents(total)] as const)
  return {
    spending: cents(entries.reduce((s, [, t]) => (t < 0 ? s - t : s), 0)),
    income: cents(entries.reduce((s, [, t]) => (t > 0 ? s + t : s), 0)),
    byCategory: entries.filter(([, t]) => t < 0).map(([category, t]) => ({ category, total: -t })).sort((a, b) => b.total - a.total),
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
  const { spending, income, byCategory } = netByCategory(items)
  return { income, spending, net: cents(income - spending), byCategory }
}

export function workoutSummary(logs: readonly LogEntry[], from?: DateKey, to?: DateKey): { sessions: number; minutes: number } {
  const items: WorkoutDetails[] = logs.flatMap((l) => (l.kind === 'workout' && inRange(l.date, from, to) ? [l.workout] : []))
  return { sessions: items.length, minutes: items.reduce((s, w) => s + w.minutes, 0) }
}
