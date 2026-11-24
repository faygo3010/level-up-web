import type { AppState, Area, DateKey, Goal, GoalEntry, LogEntry, Routine, Rule, Settings } from './types'

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
    case 'toggleRoutine':
      return {
        ...state,
        completions: { ...state.completions, [action.date]: toggle(state.completions[action.date] ?? [], action.routineId) },
      }
    case 'setRuleCheck': {
      const day = state.ruleChecks[action.date] ?? {}
      const next = action.kept === null ? withoutKey(day, action.ruleId) : { ...day, [action.ruleId]: action.kept }
      return { ...state, ruleChecks: { ...state.ruleChecks, [action.date]: next } }
    }
    case 'addGoalEntry':
      return { ...state, goalEntries: [...state.goalEntries, action.entry] }
    case 'removeGoalEntry':
      return { ...state, goalEntries: state.goalEntries.filter((e) => e.id !== action.id) }
    case 'addLog':
      return { ...state, logs: [action.entry, ...state.logs] }
    case 'removeLog':
      return { ...state, logs: state.logs.filter((l) => l.id !== action.id) }
    case 'updateSettings':
      return { ...state, settings: { ...state.settings, ...action.settings } }
    case 'replace':
      return action.state
  }
}
