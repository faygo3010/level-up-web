import { reducer } from '../reducer'
import { goalProgress } from '../progress'
import { starterState } from '../defaults'
import { parseState, serializeState } from '../storage'
import type { LogEntry } from '../types'
import { goal, routine, stateWith } from './fixtures'

const D = '2026-11-24' // Tuesday
const base = { date: D, text: '', createdAt: 0 }
const money = (id: string, amount: number, areaId = 'finance'): LogEntry => ({ ...base, id, areaId, kind: 'money', money: { amount, category: 'food' } })
const workout = (id: string, minutes: number): LogEntry => ({ ...base, id, areaId: 'fitness', kind: 'workout', workout: { activity: 'Run', minutes } })

describe('goals that track the journal', () => {
  it('counts spending logged in the goal’s area towards a spending budget', () => {
    const g = goal({ id: 'b', areaId: 'finance', period: 'monthly', target: 400, direction: 'atMost', tracks: 'spending' })
    const s = stateWith({ goals: [g], logs: [money('1', -14), money('2', -6), money('3', 2000), money('4', -50, 'work')] })
    expect(goalProgress(g, s.goalEntries, D, 1, s.logs).current).toBe(20)
  })

  it('counts workouts and workout minutes, plus any manual entries', () => {
    const sessions = goal({ id: 's', tracks: 'workouts' })
    const minutes = goal({ id: 'm', tracks: 'workoutMinutes', target: 120 })
    const logs = [workout('1', 30), workout('2', 45)]
    expect(goalProgress(sessions, [{ id: 'e', goalId: 's', date: D, value: 1 }], D, 1, logs).current).toBe(3)
    expect(goalProgress(minutes, [], D, 1, logs).current).toBe(75)
  })

  it('ignores the journal for goals that track nothing', () => {
    expect(goalProgress(goal(), [], D, 1, [workout('1', 30)]).current).toBe(0)
  })

  it('starter goals are linked and survive a backup round trip', () => {
    const s = starterState(D)
    expect(s.goals.find((x) => x.id === 'g-spend')?.tracks).toBe('spending')
    expect(s.goals.find((x) => x.id === 'g-train')?.tracks).toBe('workouts')
    expect(parseState(serializeState(s))).toEqual({ ok: true, state: s })
  })
})

describe('routines completed by a journal entry', () => {
  const s = stateWith({
    routines: [
      routine({ id: 'journal', areaId: 'trading', completedBy: 'trade', days: [1, 2, 3, 4, 5] }),
      routine({ id: 'weekend', areaId: 'trading', completedBy: 'trade', days: [0, 6] }),
      routine({ id: 'other', areaId: 'work', completedBy: 'trade' }),
    ],
  })
  const trade: LogEntry = { ...base, id: 't', areaId: 'trading', kind: 'trade', trade: { symbol: 'ES', side: 'long', pnl: 1, followedPlan: true } }

  it('ticks scheduled routines in the same area that the entry type completes', () => {
    expect(reducer(s, { type: 'addLog', entry: trade }).completions[D]).toEqual(['journal'])
  })

  it('does not double-tick or untick', () => {
    const once = reducer(s, { type: 'addLog', entry: trade })
    expect(reducer(once, { type: 'addLog', entry: { ...trade, id: 't2' } }).completions[D]).toEqual(['journal'])
  })

  it('starter routines are linked', () => {
    const st = starterState(D)
    expect(st.routines.find((r) => r.id === 'trade-journal')?.completedBy).toBe('trade')
    expect(st.routines.find((r) => r.id === 'fin-log')?.completedBy).toBe('money')
    expect(st.routines.find((r) => r.id === 'fit-train')?.completedBy).toBe('workout')
  })
})
