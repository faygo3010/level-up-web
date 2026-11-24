import { reducer } from '../reducer'
import { mergeStates } from '../merge'
import { parseState, serializeState } from '../storage'
import { emptyState, starterState } from '../defaults'
import type { Memory } from '../types'

const memory = (id: string, text = 'Prefers morning workouts'): Memory => ({ id, text, areaId: 'fitness', createdAt: 1, source: 'Claude' })

describe('coach memories', () => {
  it('starts empty and survives a backup round trip', () => {
    expect(emptyState().memories).toEqual([])
    const s = reducer(starterState('2026-11-24'), { type: 'addMemory', memory: memory('m1') })
    expect(parseState(serializeState(s))).toEqual({ ok: true, state: s })
  })

  it('loads older backups that have no memories', () => {
    const { memories: _m, ...old } = emptyState()
    const r = parseState(JSON.stringify(old))
    expect(r.ok && r.state.memories).toEqual([])
  })

  it('adds newest first and removes by id', () => {
    const s = reducer(reducer(emptyState(), { type: 'addMemory', memory: memory('a') }), { type: 'addMemory', memory: memory('b') })
    expect(s.memories.map((m) => m.id)).toEqual(['b', 'a'])
    expect(reducer(s, { type: 'removeMemory', id: 'a' }).memories.map((m) => m.id)).toEqual(['b'])
  })

  it('merges memories from two devices', () => {
    const a = { ...emptyState(), memories: [memory('x')] }
    const b = { ...emptyState(), memories: [memory('y'), memory('x', 'older text')] }
    expect(mergeStates(a, b).memories.map((m) => [m.id, m.text])).toEqual([
      ['x', 'Prefers morning workouts'],
      ['y', 'Prefers morning workouts'],
    ])
  })
})
