import { areaAdherence, bestStreak, currentStreak, dayScore, scheduledRoutines, scoreHistory } from '../adherence'
import { routine, rule, stateWith } from './fixtures'

const TUE = '2026-11-24'

describe('scheduledRoutines', () => {
  it('returns active routines scheduled for that weekday', () => {
    const state = stateWith({
      routines: [
        routine({ id: 'daily' }),
        routine({ id: 'weekend', days: [0, 6] }),
        routine({ id: 'gone', archived: true }),
      ],
    })
    expect(scheduledRoutines(state, TUE).map((r) => r.id)).toEqual(['daily'])
  })
})

describe('dayScore', () => {
  it('counts completed routines and kept rules', () => {
    const state = stateWith({
      routines: [routine({ id: 'a' }), routine({ id: 'b' })],
      rules: [rule({ id: 'x' }), rule({ id: 'y' })],
      completions: { [TUE]: ['a'] },
      ruleChecks: { [TUE]: { x: true, y: false } },
    })
    expect(dayScore(state, TUE)).toEqual({ done: 2, total: 4, score: 0.5 })
  })

  it('ignores completions of routines not scheduled that day', () => {
    const state = stateWith({
      routines: [routine({ id: 'a', days: [6] })],
      completions: { [TUE]: ['a'] },
    })
    expect(dayScore(state, TUE)).toEqual({ done: 0, total: 0, score: null })
  })

  it('can be scoped to one area', () => {
    const state = stateWith({
      routines: [routine({ id: 'a', areaId: 'fitness' }), routine({ id: 'b', areaId: 'work' })],
      completions: { [TUE]: ['b'] },
    })
    expect(dayScore(state, TUE, 'work').score).toBe(1)
    expect(dayScore(state, TUE, 'fitness').score).toBe(0)
  })
})

describe('streaks', () => {
  const state = stateWith({
    routines: [routine({ id: 'a' })],
    completions: {
      '2026-11-18': ['a'],
      '2026-11-19': ['a'],
      // 2026-11-20 missed
      '2026-11-21': ['a'],
      '2026-11-22': ['a'],
      '2026-11-23': ['a'],
    },
  })

  it('counts consecutive passing days, not penalising an unfinished today', () => {
    expect(currentStreak(state, TUE)).toBe(3)
  })

  it('includes today once it passes', () => {
    const done = { ...state, completions: { ...state.completions, [TUE]: ['a'] } }
    expect(currentStreak(done, TUE)).toBe(4)
  })

  it('skips rest days without breaking the streak', () => {
    const s = stateWith({
      routines: [routine({ id: 'a', days: [1, 2, 3, 4, 5] })],
      completions: { '2026-11-20': ['a'], '2026-11-23': ['a'] },
    })
    expect(currentStreak(s, TUE)).toBe(2)
  })

  it('finds the best streak in a window', () => {
    expect(bestStreak(state, '2026-11-01', TUE)).toBe(3)
  })

  it('is zero with nothing scheduled', () => {
    expect(currentStreak(stateWith(), TUE)).toBe(0)
  })
})

describe('start date', () => {
  it('treats days before you started as no data, not failures', () => {
    const state = stateWith({ startedOn: TUE, routines: [routine({ id: 'a' })] })
    expect(dayScore(state, '2026-11-23').score).toBeNull()
    expect(dayScore(state, TUE).score).toBe(0)
    expect(areaAdherence({ ...state, completions: { [TUE]: ['a'] } }, 'fitness', TUE, 30)).toBe(1)
  })
})

describe('history and area adherence', () => {
  const state = stateWith({
    routines: [routine({ id: 'a', areaId: 'fitness' })],
    completions: { '2026-11-23': ['a'] },
  })

  it('returns oldest-first daily scores', () => {
    expect(scoreHistory(state, TUE, 3)).toEqual([
      { date: '2026-11-22', score: 0 },
      { date: '2026-11-23', score: 1 },
      { date: TUE, score: 0 },
    ])
  })

  it('averages adherence for an area over n days, ignoring rest days', () => {
    expect(areaAdherence(state, 'fitness', TUE, 2)).toBe(0.5)
    expect(areaAdherence(state, 'work', TUE, 7)).toBeNull()
  })
})
