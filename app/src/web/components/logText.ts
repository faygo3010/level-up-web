import type { LogEntry } from '../../core/types'
import { money } from './ui'

/** How journal entries read in lists (Journal, Calendar, Home, Insights). */

const firstLine = (text: string, max: number): string => {
  const line = text.split('\n')[0]!.trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/** Row title without the amount, so the amount can sit on its own, never truncated. */
export function headline(entry: LogEntry): string {
  switch (entry.kind) {
    case 'trade':
      return `${entry.trade.symbol || 'Trade'} ${entry.trade.side}`
    case 'workout':
      return `${entry.workout.activity} · ${entry.workout.minutes} min`
    case 'money':
      // The reason ("lunch with client") says more than the category.
      return entry.text ? firstLine(entry.text, 60) : entry.money.category
    case 'note':
      return 'Note'
  }
}

/** The signed amount for trades and money, shown on the right in colour. */
export function amountOf(entry: LogEntry, currency: string): { text: string; positive: boolean } | null {
  if (entry.kind === 'trade') return { text: money(entry.trade.pnl, currency), positive: entry.trade.pnl >= 0 }
  if (entry.kind === 'money') return { text: money(entry.money.amount, currency), positive: entry.money.amount >= 0 }
  return null
}

export function details(entry: LogEntry, areaName: string | undefined): string {
  const parts = [
    entry.kind === 'trade' ? (entry.trade.followedPlan ? 'Followed plan' : 'Broke plan') : null,
    entry.kind === 'money' && entry.text ? entry.money.category : null,
    areaName ?? null,
    entry.kind === 'money' ? null : entry.text || null,
  ]
  return parts.filter(Boolean).join(' · ')
}

