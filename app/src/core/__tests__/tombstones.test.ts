import { mergeStates } from '../merge'
import { reducer } from '../reducer'
import { parseState, serializeState } from '../storage'
import { emptyState } from '../defaults'
import type { AppState, LogEntry } from '../types'
import { routine } from './fixtures'

const D = '2026-11-24'
const note = (id: string): LogEntry => ({ id, areaId: 'work', date: D, text: id, createdAt: 0, kind: 'note' })

describe('deletions survive sync', () => {
  it('a deleted journal entry is not brought back by a stale device', () => {
    const stale: AppState = { ...emptyState(), logs: [note('a'), note('b')] }
    const device = reducer(stale, { type: 'removeLog', id: 'a' })
    expect(device.tombstones).toContain('log:a')
    expect(mergeStates(device, stale).logs.map((l) => l.id)).toEqual(['b'])
    expect(mergeStates(stale, device).logs.map((l) => l.id)).toEqual(['b'])
  })

  it('a deleted goal entry stays deleted', () => {
    const stale: AppState = { ...emptyState(), goalEntries: [{ id: 'e', goalId: 'g', date: D, value: 1 }] }
    const device = reducer(stale, { type: 'removeGoalEntry', id: 'e' })
    expect(mergeStates(stale, device).goalEntries).toEqual([])
  })

  it('an unticked routine is not re-ticked by a stale device, and re-ticking clears the record', () => {
    const stale: AppState = { ...emptyState(), routines: [routine({ id: 'r' })], completions: { [D]: ['r'] } }
    const unticked = reducer(stale, { type: 'toggleRoutine', date: D, routineId: 'r' })
    expect(mergeStates(stale, unticked).completions[D]).toEqual([])
    const reticked = reducer(unticked, { type: 'toggleRoutine', date: D, routineId: 'r' })
    expect(reticked.tombstones).not.toContain(`untick:${D}:r`)
    expect(mergeStates(reticked, stale).completions[D]).toEqual(['r'])
  })

  it('archiving on either device wins', () => {
    const live: AppState = { ...emptyState(), routines: [routine({ id: 'r' })] }
    const archived = reducer(live, { type: 'archive', collection: 'routines', id: 'r' })
    expect(mergeStates(live, archived).routines[0]?.archived).toBe(true)
  })

  it('tombstones are bounded and old backups load without them', () => {
    let s: AppState = emptyState()
    for (let i = 0; i < 2100; i++) s = reducer({ ...s, logs: [note(`n${i}`)] }, { type: 'removeLog', id: `n${i}` })
    expect(s.tombstones).toHaveLength(2000)
    const { tombstones: _t, ...old } = emptyState()
    const r = parseState(JSON.stringify(old))
    expect(r.ok && r.state.tombstones).toEqual([])
    expect(parseState(serializeState(s)).ok).toBe(true)
  })
})
