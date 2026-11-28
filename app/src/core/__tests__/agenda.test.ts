import { describe, expect, it } from 'vitest'
import { dayAgenda, dayDigest, monthGrid, monthLabel, shiftMonth, weekdayLabels } from '../agenda'
import { starterState } from '../defaults'
import type { AppState, LogEntry } from '../types'

const trade = (id: string, date: string, pnl: number): LogEntry => ({
  id,
  areaId: 'trading',
  date,
  text: '',
  createdAt: 1,
  kind: 'trade',
  trade: { symbol: 'NQ', side: 'long', pnl, followedPlan: true },
})

describe('monthGrid', () => {
  it('lays November 2026 out in full Monday-first weeks', () => {
    const weeks = monthGrid('2026-11', 1)
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    expect(weeks[0]![0]).toBe('2026-10-26') // Monday before Sun 1 Nov
    expect(weeks[0]![6]).toBe('2026-11-01')
    expect(weeks.at(-1)![0]).toBe('2026-11-30')
    expect(weeks.at(-1)![6]).toBe('2026-12-06')
  })

  it('starts on Sunday when asked, and needs no padding when the month starts on it', () => {
    const weeks = monthGrid('2026-11', 0)
    expect(weeks[0]![0]).toBe('2026-11-01')
    expect(weeks.at(-1)!.at(-1)).toBe('2026-12-05')
  })

  it('handles a February that fits exactly in four weeks', () => {
    expect(monthGrid('2021-02', 1)).toHaveLength(4)
  })
})

describe('month helpers', () => {
  it('moves across year boundaries', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-11', -13)).toBe('2025-10')
  })
  it('labels months and weekdays', () => {
    expect(monthLabel('2026-11')).toBe('November 2026')
    expect(weekdayLabels(1)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(weekdayLabels(0)[0]).toBe('Sun')
  })
})

describe('dayAgenda', () => {
  const today = '2026-11-25' // Wednesday
  const base: AppState = { ...starterState('2026-11-01'), startedOn: '2026-11-01' }

  it('lists the routines scheduled that day with what was done', () => {
    const scheduled = dayAgenda(base, '2026-11-24', today).routines
    const first = scheduled[0]!.routine.id
    const state = { ...base, completions: { '2026-11-24': [first] } }
    const agenda = dayAgenda(state, '2026-11-24', today)
    expect(agenda.routines.find((r) => r.routine.id === first)?.done).toBe(true)
    expect(agenda.routines.filter((r) => r.done)).toHaveLength(1)
    expect(agenda.when).toBe('past')
  })

  it('shows rules as kept, broken or not reviewed', () => {
    const [a, b] = base.rules
    const state = { ...base, ruleChecks: { [today]: { [a!.id]: true, [b!.id]: false } } }
    const rules = dayAgenda(state, today, today).rules
    expect(rules.find((r) => r.rule.id === a!.id)?.kept).toBe(true)
    expect(rules.find((r) => r.rule.id === b!.id)?.kept).toBe(false)
    expect(rules.filter((r) => r.kept === null)).toHaveLength(base.rules.length - 2)
  })

  it('collects that day’s journal entries (newest first) and goal entries', () => {
    const goal = base.goals[0]!
    const state: AppState = {
      ...base,
      logs: [{ ...trade('a', today, 50), createdAt: 1 }, { ...trade('b', today, -20), createdAt: 2 }, trade('c', '2026-11-24', 5)],
      goalEntries: [{ id: 'g1', goalId: goal.id, date: today, value: 2 }],
    }
    const agenda = dayAgenda(state, today, today)
    expect(agenda.logs.map((l) => l.id)).toEqual(['b', 'a'])
    expect(agenda.goalEntries).toEqual([{ entry: state.goalEntries[0], goal }])
    expect(agenda.when).toBe('today')
  })

  it('marks future days as planned and gives them no score', () => {
    const agenda = dayAgenda(base, '2026-11-30', today)
    expect(agenda.when).toBe('future')
    expect(agenda.score).toBeNull()
    expect(agenda.routines.every((r) => !r.done)).toBe(true)
  })

  it('treats days before you started as no data', () => {
    expect(dayAgenda(base, '2026-10-20', today).score).toBeNull()
  })
})

describe('dayDigest', () => {
  it('summarises a day for the month grid', () => {
    const state: AppState = { ...starterState('2026-11-01'), logs: [trade('a', '2026-11-03', 120), trade('b', '2026-11-03', -20)] }
    expect(dayDigest(state, '2026-11-03', '2026-11-25')).toMatchObject({ entries: 2, pnl: 100 })
    expect(dayDigest(state, '2026-11-04', '2026-11-25')).toMatchObject({ entries: 0, pnl: null })
    expect(dayDigest(state, '2026-12-01', '2026-11-25').score).toBeNull()
  })
})
