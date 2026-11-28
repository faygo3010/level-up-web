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

  it('never loses your name or that setup is done', () => {
    const base = { currency: '£', streakThreshold: 0.8, weekStartsOn: 1 as const }
    const merged = mergeStates(stateWith({ settings: base }), stateWith({ settings: { ...base, name: 'Jo', onboardedAt: 5 } }))
    expect(merged.settings).toMatchObject({ name: 'Jo', onboardedAt: 5 })
    const both = mergeStates(stateWith({ settings: { ...base, name: 'Sam', onboardedAt: 9 } }), stateWith({ settings: { ...base, name: 'Jo', onboardedAt: 5 } }))
    expect(both.settings).toMatchObject({ name: 'Sam', onboardedAt: 5 })
  })

  describe('with the last synced copy (three-way)', () => {
    const base = stateWith({ routines: [routine({ id: 'steps', title: '10k steps' }), routine({ id: 'train', title: 'Train' })] })

    it('keeps an edit made elsewhere when this device did not touch that item', () => {
      // An AI app renamed "steps"; this device only renamed "train".
      const remote = stateWith({ routines: [routine({ id: 'steps', title: '4k steps' }), routine({ id: 'train', title: 'Train' })] })
      const local = stateWith({ routines: [routine({ id: 'steps', title: '10k steps' }), routine({ id: 'train', title: 'Lift' })] })
      const merged = mergeStates(local, remote, base)
      expect(merged.routines.map((r) => r.title)).toEqual(['4k steps', 'Lift'])
    })

    it('lets this device win only when both changed the same item', () => {
      const remote = stateWith({ routines: [routine({ id: 'steps', title: '4k steps' })] })
      const local = stateWith({ routines: [routine({ id: 'steps', title: '12k steps' })] })
      expect(mergeStates(local, remote, base).routines[0]!.title).toBe('12k steps')
    })

    it('treats key order as no change', () => {
      const reordered = { ...base, routines: base.routines.map((r) => JSON.parse(JSON.stringify(r, Object.keys(r).reverse()))) }
      const remote = stateWith({ routines: [routine({ id: 'steps', title: '4k steps' }), routine({ id: 'train', title: 'Train' })] })
      expect(mergeStates(reordered, remote, base).routines[0]!.title).toBe('4k steps')
    })

    it('takes settings and rule checks changed elsewhere', () => {
      const b = stateWith({ ruleChecks: { d1: { x: true } } })
      const remote = stateWith({ ruleChecks: { d1: { x: false } }, settings: { ...b.settings, currency: '$' } })
      const merged = mergeStates(b, remote, b)
      expect(merged.ruleChecks).toEqual({ d1: { x: false } })
      expect(merged.settings.currency).toBe('$')
    })

    it('takes journal edits made elsewhere', () => {
      const n = note('n1')
      const merged = mergeStates(stateWith({ logs: [n] }), stateWith({ logs: [{ ...n, text: 'edited by AI' }] }), stateWith({ logs: [n] }))
      expect(merged.logs[0]!.text).toBe('edited by AI')
    })
  })
})
