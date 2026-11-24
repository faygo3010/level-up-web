const trim = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/** "£400" for currency-like symbols, "2.5 hours" for word units, "3" with no unit. */
export function withUnit(n: number, unit: string): string {
  if (!unit) return trim(n)
  return /^[^\p{L}\p{N}\s]{1,3}$/u.test(unit) ? `${unit}${trim(n)}` : `${trim(n)} ${unit}`
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** "Weekdays", "Every day", or "Mon, Thu". */
export function describeDays(days: readonly number[]): string {
  if (days.length === 7) return 'Every day'
  const set = new Set(days)
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return 'Weekdays'
  if (days.length === 2 && set.has(0) && set.has(6)) return 'Weekends'
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => set.has(d)).map((d) => DAY_NAMES[d]).join(', ')
}
