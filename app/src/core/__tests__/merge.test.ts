import { mergeStates } from '../merge'
import { routine, rule, stateWith } from './fixtures'
import type { LogEntry } from '../types'

const note = (id: string): LogEntry => ({ id, areaId: 'work', date: '2026-11-24', text: id, createdAt: 0, kind: 'note' })

describe('mergeStates', () => {
  it('unions items by id, with the primary side winning conflicts', () => {
    const primary = stateWith({ routines: [routine({ id: 'a', title: 'Primary' })], logs: [note('p')] })
    const secondary = stateWith({
      routines: [routine({ id: 'a', title: 'Secondary' }), routine({ id: 'b' })],
      logs: [note('s'), note('p')],
    })
    const merged = mergeStates(primary, secondary)
    expect(merged.routines.map((r) => [r.id, r.title])).toEqual([
      ['a', 'Primary'],
      ['b', 'Train'],
    ])
    expect(merged.logs.map((l) => l.id)).toEqual(['p', 's'])
  })

  it('unions completions per day and merges rule checks', () => {
    const merged = mergeStates(
      stateWith({ completions: { d1: ['a'] }, ruleChecks: { d1: { x: true } }, rules: [rule()] }),
      stateWith({ completions: { d1: ['a', 'b'], d2: ['c'] }, ruleChecks: { d1: { x: false, y: true } } }),
    )
    expect(merged.completions).toEqual({ d1: ['a', 'b'], d2: ['c'] })
    expect(merged.ruleChecks).toEqual({ d1: { x: true, y: true } })
  })

  it('keeps primary settings and the earliest start date', () => {
    const merged = mergeStates(
      stateWith({ startedOn: '2026-11-20', settings: { currency: '$', streakThreshold: 0.8, weekStartsOn: 1 } }),
      stateWith({ startedOn: '2026-10-01' }),
    )
    expect(merged.settings.currency).toBe('$')
    expect(merged.startedOn).toBe('2026-10-01')
    expect(mergeStates(stateWith(), stateWith()).startedOn).toBeUndefined()
  })
})
