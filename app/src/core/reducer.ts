import { MAX_FORGOTTEN, MAX_TOMBSTONES } from './schema'
import type { AppState, Area, DateKey, Goal, GoalEntry, LogEntry, Memory, Routine, Rule, Settings } from './types'

/** Collections that hold editable, archivable definitions of your system. */
export interface Collections {
  areas: Area
  routines: Routine
  goals: Goal
  rules: Rule
}
export type CollectionName = keyof Collections

export type Action =
  | { [K in CollectionName]: { type: 'upsert'; collection: K; item: Collections[K] } }[CollectionName]
  | { type: 'archive'; collection: CollectionName; id: string }
  | { type: 'toggleRoutine'; date: DateKey; routineId: string }
  | { type: 'setRuleCheck'; date: DateKey; ruleId: string; kept: boolean | null }
  | { type: 'addGoalEntry'; entry: GoalEntry }
  | { type: 'removeGoalEntry'; id: string }
  | { type: 'addLog'; entry: LogEntry }
  | { type: 'removeLog'; id: string }
  | { type: 'updateLog'; entry: LogEntry }
  | { type: 'addMemory'; memory: Memory }
  | { type: 'removeMemory'; id: string }
  | { type: 'updateSettings'; settings: Partial<Settings> }
  | { type: 'replace'; state: AppState }

function upsert<T extends { id: string }>(items: readonly T[], item: T): T[] {
  return items.some((i) => i.id === item.id) ? items.map((i) => (i.id === item.id ? item : i)) : [...items, item]
}

function archive<T extends { id: string; archived: boolean }>(items: readonly T[], id: string): T[] {
  return items.map((i) => (i.id === id ? { ...i, archived: true } : i))
}

function toggle(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]
}

function withoutKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key))
}

type Item = { id: string; archived: boolean }

/**
 * Apply a transform to one definition collection. The mapped Action type
 * already guarantees that an upserted item matches its collection.
 */
function updateCollection(state: AppState, name: CollectionName, fn: (items: readonly Item[]) => Item[]): AppState {
  return { ...state, [name]: fn(state[name] as readonly Item[]) }
}

/** Tick routines that this kind of entry completes (same area, scheduled that day). */
function completeLinkedRoutines(state: AppState, entry: LogEntry): AppState {
  const day = new Date(`${entry.date}T00:00:00Z`).getUTCDay()
  const done = state.completions[entry.date] ?? []
  const toTick = state.routines.filter(
    (r) => !r.archived && r.completedBy === entry.kind && r.areaId === entry.areaId && r.days.includes(day as never) && !done.includes(r.id),
  )
  if (toTick.length === 0) return state
  return { ...state, completions: { ...state.completions, [entry.date]: [...done, ...toTick.map((r) => r.id)] } }
}

/** Record a deletion so a stale device can't sync it back. */
function bury(state: AppState, key: string): readonly string[] {
  return [key, ...state.tombstones.filter((t) => t !== key)].slice(0, MAX_TOMBSTONES)
}

function archiveArea(state: AppState, areaId: string): AppState {
  const inArea = <T extends { areaId: string; archived: boolean }>(items: readonly T[]): T[] =>
    items.map((i) => (i.areaId === areaId ? { ...i, archived: true } : i))
  return {
    ...state,
    areas: archive(state.areas, areaId),
    routines: inArea(state.routines),
    goals: inArea(state.goals),
    rules: inArea(state.rules),
  }
}

/** Pure state transitions. Every branch returns a new object; nothing is mutated. */
export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'upsert':
      return updateCollection(state, action.collection, (items) => upsert(items, action.item as Item))
    case 'archive':
      return action.collection === 'areas'
        ? archiveArea(state, action.id)
        : updateCollection(state, action.collection, (items) => archive(items, action.id))
    case 'toggleRoutine': {
      const key = `untick:${action.date}:${action.routineId}`
      const wasDone = (state.completions[action.date] ?? []).includes(action.routineId)
      return {
        ...state,
        completions: { ...state.completions, [action.date]: toggle(state.completions[action.date] ?? [], action.routineId) },
        tombstones: wasDone ? bury(state, key) : state.tombstones.filter((t) => t !== key),
      }
    }
    case 'setRuleCheck': {
      const day = state.ruleChecks[action.date] ?? {}
      const next = action.kept === null ? withoutKey(day, action.ruleId) : { ...day, [action.ruleId]: action.kept }
      return { ...state, ruleChecks: { ...state.ruleChecks, [action.date]: next } }
    }
    case 'addGoalEntry':
      return { ...state, goalEntries: [...state.goalEntries, action.entry] }
    case 'removeGoalEntry':
      return { ...state, goalEntries: state.goalEntries.filter((e) => e.id !== action.id), tombstones: bury(state, `goalEntry:${action.id}`) }
    case 'addLog':
      return completeLinkedRoutines({ ...state, logs: [action.entry, ...state.logs] }, action.entry)
    case 'updateLog':
      return { ...state, logs: state.logs.map((l) => (l.id === action.entry.id ? action.entry : l)) }
    case 'removeLog':
      return { ...state, logs: state.logs.filter((l) => l.id !== action.id), tombstones: bury(state, `log:${action.id}`) }
    case 'addMemory':
      return { ...state, memories: [action.memory, ...state.memories] }
    case 'removeMemory':
      return {
        ...state,
        memories: state.memories.filter((m) => m.id !== action.id),
        forgottenMemoryIds: [action.id, ...state.forgottenMemoryIds.filter((x) => x !== action.id)].slice(0, MAX_FORGOTTEN),
      }
    case 'updateSettings':
      return { ...state, settings: { ...state.settings, ...action.settings } }
    case 'replace':
      return action.state
  }
}
