import { moneySummary, tradeStats, workoutSummary } from '../stats'
import type { LogEntry } from '../types'

const base = { areaId: 'a', text: '', createdAt: 0 }
const trade = (id: string, pnl: number, followedPlan: boolean, date = '2026-11-20'): LogEntry => ({
  ...base,
  id,
  date,
  kind: 'trade',
  trade: { symbol: 'ES', side: 'long', pnl, followedPlan },
})
const money = (id: string, amount: number, date: string, category = 'food'): LogEntry => ({
  ...base,
  id,
  date,
  kind: 'money',
  money: { amount, category },
})

describe('tradeStats', () => {
  it('splits results by whether the plan was followed', () => {
    const s = tradeStats([trade('1', 200, true), trade('2', -100, true), trade('3', -300, false), { ...base, id: 'n', date: '2026-11-20', kind: 'note' }])
    expect(s).toEqual({
      count: 3,
      wins: 1,
      winRate: 1 / 3,
      totalPnl: -200,
      planAdherence: 2 / 3,
      followed: { count: 2, pnl: 100 },
      broken: { count: 1, pnl: -300 },
    })
  })

  it('filters by date range and handles no trades', () => {
    expect(tradeStats([trade('1', 50, true, '2026-10-01')], '2026-11-01', '2026-11-30')).toMatchObject({
      count: 0,
      winRate: 0,
      planAdherence: 0,
    })
  })
})

describe('moneySummary', () => {
  it('totals income, spending and categories for a month', () => {
    const s = moneySummary(
      [money('1', 2000, '2026-11-01', 'salary'), money('2', -50, '2026-11-03'), money('3', -25, '2026-11-09'), money('4', -999, '2026-10-30')],
      '2026-11',
    )
    expect(s).toEqual({ income: 2000, spending: 75, net: 1925, byCategory: [{ category: 'food', total: 75 }] })
  })
})

describe('workoutSummary', () => {
  it('counts sessions and minutes in a range', () => {
    const w: LogEntry = { ...base, id: 'w', date: '2026-11-20', kind: 'workout', workout: { activity: 'run', minutes: 30 } }
    expect(workoutSummary([w, { ...w, id: 'w2', date: '2026-01-01' }], '2026-11-01', '2026-11-30')).toEqual({ sessions: 1, minutes: 30 })
  })
})
