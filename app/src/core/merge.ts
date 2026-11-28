import { MAX_FORGOTTEN, MAX_TOMBSTONES } from './schema.js'
import type { AppState, DateKey } from './types.js'

/** JSON with sorted keys, so two copies of the same value compare equal whatever their key order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  )
}
const same = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b)

/**
 * Pick between the primary and secondary copy of one value. With the last
 * synced copy (base), a side that didn't change it gives way to the side that
 * did; the primary only wins when both changed it.
 */
function pick<T>(primary: T, secondary: T, base: T | undefined, hasBase: boolean): T {
  return hasBase && same(primary, base) ? secondary : primary
}

function unionById<T extends { id: string }>(primary: readonly T[], secondary: readonly T[], base?: readonly T[]): T[] {
  const seen = new Set(primary.map((i) => i.id))
  const other = new Map(secondary.map((i) => [i.id, i]))
  const before = new Map((base ?? []).map((i) => [i.id, i]))
  const merged = primary.map((p) => {
    const s = other.get(p.id)
    return s && before.has(p.id) ? pick(p, s, before.get(p.id), true) : p
  })
  return [...merged, ...secondary.filter((i) => !seen.has(i.id))]
}

/** Archiving on either side wins; otherwise as unionById. */
function unionArchivable<T extends { id: string; archived: boolean }>(primary: readonly T[], secondary: readonly T[], base?: readonly T[]): T[] {
  const archivedElsewhere = new Set(secondary.filter((i) => i.archived).map((i) => i.id))
  return unionById(primary, secondary, base).map((i) => (archivedElsewhere.has(i.id) && !i.archived ? { ...i, archived: true } : i))
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

function mergeRuleChecks(primary: AppState['ruleChecks'], secondary: AppState['ruleChecks'], base?: AppState['ruleChecks']): AppState['ruleChecks'] {
  const dates = new Set([...Object.keys(primary), ...Object.keys(secondary)])
  return Object.fromEntries(
    [...dates].map((d) => {
      const p = primary[d] ?? {}
      const s = secondary[d] ?? {}
      const b = base?.[d] ?? {}
      const ids = new Set([...Object.keys(p), ...Object.keys(s)])
      const day: Record<string, boolean> = {}
      for (const id of ids) {
        // Without a base, primary wins; with one, a side that didn't change it gives way.
        const v = base ? pick(p[id], s[id], b[id], true) : (p[id] ?? s[id])
        if (v !== undefined) day[id] = v
      }
      return [d, day]
    }),
  )
}

/** Union memories, but a memory forgotten on either side stays forgotten. */
function mergeMemories(primary: AppState, secondary: AppState, base?: AppState): Pick<AppState, 'memories' | 'forgottenMemoryIds'> {
  const forgotten = [...new Set([...primary.forgottenMemoryIds, ...secondary.forgottenMemoryIds])].slice(0, MAX_FORGOTTEN)
  const gone = new Set(forgotten)
  return { memories: unionById(primary.memories, secondary.memories, base?.memories).filter((m) => !gone.has(m.id)), forgottenMemoryIds: forgotten }
}

/**
 * The primary side's settings win, but never lose who you are or that setup
 * is done just because the other copy (or an older app version) lacks them.
 */
function mergeSettings(primary: AppState['settings'], secondary: AppState['settings'], base?: AppState['settings']): AppState['settings'] {
  if (base) {
    // Field by field: take whichever side changed it.
    const keys = new Set([...Object.keys(primary), ...Object.keys(secondary)]) as Set<keyof AppState['settings']>
    const out: Record<string, unknown> = {}
    for (const k of keys) {
      const v = pick(primary[k], secondary[k], base[k], true)
      if (v !== undefined) out[k] = v
    }
    primary = out as unknown as AppState['settings']
  }
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
 * Combine two copies of the same account edited in different places (devices,
 * or an AI app through the connector). Items are unioned by id. Given `base`,
 * the copy both sides last agreed on, each item takes the side that actually
 * changed it, and the primary side wins only when both changed the same item.
 * Without a base, the primary side wins every conflict. Limitation: an item
 * deleted on one side while the other was offline and also edited can reappear.
 */
export function mergeStates(primary: AppState, secondary: AppState, base?: AppState): AppState {
  const startedOn = earliest(primary.startedOn, secondary.startedOn)
  const tombstones = [...new Set([...primary.tombstones, ...secondary.tombstones])].slice(0, MAX_TOMBSTONES)
  const dead = new Set(tombstones)
  const completions = Object.fromEntries(
    Object.entries(unionCompletions(primary.completions, secondary.completions)).map(([d, ids]) => [d, ids.filter((id) => !dead.has(`untick:${d}:${id}`))]),
  )
  return {
    version: 1,
    areas: unionArchivable(primary.areas, secondary.areas, base?.areas),
    routines: unionArchivable(primary.routines, secondary.routines, base?.routines),
    goals: unionArchivable(primary.goals, secondary.goals, base?.goals),
    goalEntries: unionById(primary.goalEntries, secondary.goalEntries, base?.goalEntries).filter((e) => !dead.has(`goalEntry:${e.id}`)),
    rules: unionArchivable(primary.rules, secondary.rules, base?.rules),
    logs: unionById(primary.logs, secondary.logs, base?.logs).filter((l) => !dead.has(`log:${l.id}`)),
    ...mergeMemories(primary, secondary, base),
    completions,
    ruleChecks: mergeRuleChecks(primary.ruleChecks, secondary.ruleChecks, base?.ruleChecks),
    settings: mergeSettings(primary.settings, secondary.settings, base?.settings),
    tombstones,
    ...(startedOn !== undefined && { startedOn }),
  }
}
