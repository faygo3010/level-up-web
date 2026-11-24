import type { AppState, DateKey } from './types'

function unionById<T extends { id: string }>(primary: readonly T[], secondary: readonly T[]): T[] {
  const seen = new Set(primary.map((i) => i.id))
  return [...primary, ...secondary.filter((i) => !seen.has(i.id))]
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
  return {
    version: 1,
    areas: unionById(primary.areas, secondary.areas),
    routines: unionById(primary.routines, secondary.routines),
    goals: unionById(primary.goals, secondary.goals),
    goalEntries: unionById(primary.goalEntries, secondary.goalEntries),
    rules: unionById(primary.rules, secondary.rules),
    logs: unionById(primary.logs, secondary.logs),
    completions: unionCompletions(primary.completions, secondary.completions),
    ruleChecks: mergeRuleChecks(primary.ruleChecks, secondary.ruleChecks),
    settings: primary.settings,
    ...(startedOn !== undefined && { startedOn }),
  }
}
