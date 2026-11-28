import { MAX_FORGOTTEN, MAX_TOMBSTONES } from './schema.js'
import type { AppState, DateKey } from './types.js'

function unionById<T extends { id: string }>(primary: readonly T[], secondary: readonly T[]): T[] {
  const seen = new Set(primary.map((i) => i.id))
  return [...primary, ...secondary.filter((i) => !seen.has(i.id))]
}

/** Archiving on either side wins; otherwise the primary copy wins. */
function unionArchivable<T extends { id: string; archived: boolean }>(primary: readonly T[], secondary: readonly T[]): T[] {
  const archivedElsewhere = new Set(secondary.filter((i) => i.archived).map((i) => i.id))
  return unionById(primary, secondary).map((i) => (archivedElsewhere.has(i.id) && !i.archived ? { ...i, archived: true } : i))
}

function unionCompletions(
  a: AppState['completions'],
  b: AppState['completions'],
): Record<DateKey, readonly string[]> {
  const dates = new Set([...Object.keys(a), ...Object.keys(b)])
  return Object.fromEntries(
    [...dates].map((d) => [d, [...new Set([...(a[d] ?? []), ...(b[d] ?? [])])]]),
  )
}

function mergeRuleChecks(primary: AppState['ruleChecks'], secondary: AppState['ruleChecks']): AppState['ruleChecks'] {
  const dates = new Set([...Object.keys(primary), ...Object.keys(secondary)])
  return Object.fromEntries([...dates].map((d) => [d, { ...secondary[d], ...primary[d] }]))
}

/** Union memories, but a memory forgotten on either side stays forgotten. */
function mergeMemories(primary: AppState, secondary: AppState): Pick<AppState, 'memories' | 'forgottenMemoryIds'> {
  const forgotten = [...new Set([...primary.forgottenMemoryIds, ...secondary.forgottenMemoryIds])].slice(0, MAX_FORGOTTEN)
  const gone = new Set(forgotten)
  return { memories: unionById(primary.memories, secondary.memories).filter((m) => !gone.has(m.id)), forgottenMemoryIds: forgotten }
}

/**
 * The primary side's settings win, but never lose who you are or that setup
 * is done just because the other copy (or an older app version) lacks them.
 */
function mergeSettings(primary: AppState['settings'], secondary: AppState['settings']): AppState['settings'] {
  const name = primary.name ?? secondary.name
  const onboardedAt = [primary.onboardedAt, secondary.onboardedAt].filter((x): x is number => x !== undefined).sort((a, b) => a - b)[0]
  return { ...primary, ...(name !== undefined && { name }), ...(onboardedAt !== undefined && { onboardedAt }) }
}

function earliest(a?: DateKey, b?: DateKey): DateKey | undefined {
  if (a === undefined) return b
  if (b === undefined) return a
  return a < b ? a : b
}

/**
 * Combine two copies of the same account edited on different devices.
 * Nothing is lost: items are unioned by id and the primary side wins when
 * both edited the same item. Limitation: an item deleted on one device while
 * the other was offline and also edited can reappear.
 */
export function mergeStates(primary: AppState, secondary: AppState): AppState {
  const startedOn = earliest(primary.startedOn, secondary.startedOn)
  const tombstones = [...new Set([...primary.tombstones, ...secondary.tombstones])].slice(0, MAX_TOMBSTONES)
  const dead = new Set(tombstones)
  const completions = Object.fromEntries(
    Object.entries(unionCompletions(primary.completions, secondary.completions)).map(([d, ids]) => [d, ids.filter((id) => !dead.has(`untick:${d}:${id}`))]),
  )
  return {
    version: 1,
    areas: unionArchivable(primary.areas, secondary.areas),
    routines: unionArchivable(primary.routines, secondary.routines),
    goals: unionArchivable(primary.goals, secondary.goals),
    goalEntries: unionById(primary.goalEntries, secondary.goalEntries).filter((e) => !dead.has(`goalEntry:${e.id}`)),
    rules: unionArchivable(primary.rules, secondary.rules),
    logs: unionById(primary.logs, secondary.logs).filter((l) => !dead.has(`log:${l.id}`)),
    ...mergeMemories(primary, secondary),
    completions,
    ruleChecks: mergeRuleChecks(primary.ruleChecks, secondary.ruleChecks),
    settings: mergeSettings(primary.settings, secondary.settings),
    tombstones,
    ...(startedOn !== undefined && { startedOn }),
  }
}
