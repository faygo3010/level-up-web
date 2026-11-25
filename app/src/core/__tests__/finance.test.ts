import { formatMoney, withUnit } from '../format'
import { moneySummary, tradeStats } from '../stats'
import { goalProgress } from '../progress'
import type { LogEntry } from '../types'
import { goal } from './fixtures'

const base = { areaId: 'finance', text: '', createdAt: 0 }
const money = (id: string, amount: number, category: string, date = '2026-11-10'): LogEntry => ({ ...base, id, date, kind: 'money', money: { amount, category } })
const trade = (id: string, pnl: number, followedPlan = true): LogEntry => ({ ...base, id, areaId: 'trading', date: '2026-11-10', kind: 'trade', trade: { symbol: 'ES', side: 'long', pnl, followedPlan } })

describe('money formatting', () => {
  it('uses pennies consistently and never shows -£0', () => {
    expect(formatMoney(12.5, '£')).toBe('£12.50')
    expect(formatMoney(12, '£')).toBe('£12')
    expect(formatMoney(-0.001, '£')).toBe('£0')
    expect(formatMoney(0.1 + 0.2, '£')).toBe('£0.30')
    expect(formatMoney(-1234.567, '$')).toBe('-$1,234.57')
    expect(withUnit(12.75, '£')).toBe('£12.75')
    expect(withUnit(2.5, 'hours')).toBe('2.5 hours')
  })
})

describe('refunds and categories', () => {
  it('a refund reduces spending in its category instead of counting as income', () => {
    const s = moneySummary([money('1', -50, 'shopping'), money('2', 50, 'Shopping'), money('3', -20, 'Food'), money('4', -5, 'food'), money('5', 2000, 'salary')], '2026-11')
    expect(s).toEqual({ income: 2000, spending: 25, net: 1975, byCategory: [{ category: 'food', total: 25 }] })
  })

  it('a spending budget nets refunds too', () => {
    const g = goal({ areaId: 'finance', period: 'monthly', target: 400, direction: 'atMost', tracks: 'spending' })
    expect(goalProgress(g, [], '2026-11-24', 1, [money('1', -100, 'shoes'), money('2', 60, 'shoes')]).current).toBe(40)
  })
})

describe('goal bars stay in range', () => {
  it('never shows a negative bar or more remaining than the target', () => {
    const g = goal({ target: 500, tracks: 'tradePnl', areaId: 'trading', period: 'monthly' })
    const p = goalProgress(g, [], '2026-11-24', 1, [trade('1', -300)])
    expect(p.ratio).toBe(0)
    expect(p.remaining).toBe(500)
  })
})

describe('trade stats', () => {
  it('reports wins, losses, breakevens, averages and expectancy', () => {
    const s = tradeStats([trade('1', 300), trade('2', -100), trade('3', 0), trade('4', 100, false)])
    expect(s).toMatchObject({ count: 4, wins: 2, losses: 1, breakeven: 1, avgWin: 200, avgLoss: -100, expectancy: 75 })
    expect(tradeStats([])).toMatchObject({ avgWin: 0, avgLoss: 0, expectancy: 0, losses: 0, breakeven: 0 })
  })
})
