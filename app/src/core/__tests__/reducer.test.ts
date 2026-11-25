import { reducer } from '../reducer'
import { goal, routine, rule, stateWith } from './fixtures'
import { emptyState } from '../defaults'
import type { LogEntry } from '../types'

const D = '2026-11-24'

describe('reducer', () => {
  it('upserts items without mutating the previous state', () => {
    const before = stateWith()
    const after = reducer(before, { type: 'upsert', collection: 'routines', item: routine() })
    expect(after.routines).toHaveLength(1)
    expect(before.routines).toHaveLength(0)

    const renamed = reducer(after, { type: 'upsert', collection: 'routines', item: routine({ title: 'Lift' }) })
    expect(renamed.routines).toEqual([routine({ title: 'Lift' })])
  })

  it('archives items by id', () => {
    const s = reducer(stateWith({ rules: [rule()] }), { type: 'archive', collection: 'rules', id: 'x1' })
    expect(s.rules[0]?.archived).toBe(true)
  })

  it('archiving an area archives everything inside it', () => {
    const s = reducer(
      stateWith({
        areas: [{ id: 'fitness', name: 'Fitness', icon: '', color: '', archived: false }],
        routines: [routine(), routine({ id: 'r2', areaId: 'work' })],
        goals: [goal()],
        rules: [rule({ areaId: 'fitness' })],
      }),
      { type: 'archive', collection: 'areas', id: 'fitness' },
    )
    expect(s.areas[0]?.archived).toBe(true)
    expect(s.routines.map((r) => r.archived)).toEqual([true, false])
    expect(s.goals[0]?.archived).toBe(true)
    expect(s.rules[0]?.archived).toBe(true)
  })

  it('toggles a routine completion on and off', () => {
    const on = reducer(stateWith(), { type: 'toggleRoutine', date: D, routineId: 'r1' })
    expect(on.completions[D]).toEqual(['r1'])
    const off = reducer(on, { type: 'toggleRoutine', date: D, routineId: 'r1' })
    expect(off.completions[D]).toEqual([])
  })

  it('sets and clears rule checks', () => {
    const kept = reducer(stateWith(), { type: 'setRuleCheck', date: D, ruleId: 'x1', kept: true })
    expect(kept.ruleChecks[D]).toEqual({ x1: true })
    const cleared = reducer(kept, { type: 'setRuleCheck', date: D, ruleId: 'x1', kept: null })
    expect(cleared.ruleChecks[D]).toEqual({})
  })

  it('adds and removes goal entries', () => {
    const s = reducer(stateWith({ goals: [goal()] }), { type: 'addGoalEntry', entry: { id: 'e1', goalId: 'g1', date: D, value: 1 } })
    expect(s.goalEntries).toHaveLength(1)
    expect(reducer(s, { type: 'removeGoalEntry', id: 'e1' }).goalEntries).toHaveLength(0)
  })

  it('adds logs newest first and removes them', () => {
    const log = (id: string): LogEntry => ({ id, areaId: 'work', date: D, text: id, createdAt: 0, kind: 'note' })
    const s = reducer(reducer(stateWith(), { type: 'addLog', entry: log('a') }), { type: 'addLog', entry: log('b') })
    expect(s.logs.map((l) => l.id)).toEqual(['b', 'a'])
    expect(reducer(s, { type: 'removeLog', id: 'a' }).logs.map((l) => l.id)).toEqual(['b'])
  })

  it('updates a log entry in place, keeping its position', () => {
    const log = (id: string, text: string): LogEntry => ({ id, areaId: 'work', date: D, text, createdAt: 0, kind: 'note' })
    const s = reducer(reducer(stateWith(), { type: 'addLog', entry: log('a', 'one') }), { type: 'addLog', entry: log('b', 'two') })
    const u = reducer(s, { type: 'updateLog', entry: log('a', 'edited') })
    expect(u.logs.map((l) => [l.id, l.text])).toEqual([['b', 'two'], ['a', 'edited']])
  })

  it('updates settings and replaces the whole state', () => {
    const s = reducer(stateWith(), { type: 'updateSettings', settings: { currency: '$' } })
    expect(s.settings.currency).toBe('$')
    expect(s.settings.weekStartsOn).toBe(emptyState().settings.weekStartsOn)
    const replaced = reducer(s, { type: 'replace', state: emptyState() })
    expect(replaced.settings.currency).toBe('£')
  })
})
