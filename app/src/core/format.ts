const trim = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/** "£400" for currency-like symbols, "2.5 hours" for word units, "3" with no unit. */
export function withUnit(n: number, unit: string): string {
  if (!unit) return trim(n)
  return /^[^\p{L}\p{N}\s]{1,3}$/u.test(unit) ? `${unit}${trim(n)}` : `${trim(n)} ${unit}`
}
