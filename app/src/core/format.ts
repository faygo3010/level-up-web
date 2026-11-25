const trim = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1))

const isCurrency = (unit: string) => /^[^\p{L}\p{N}\s]{1,3}$/u.test(unit)

/**
 * Money to the penny: "£12", "£12.50", "-$1,234.57". Rounds before choosing
 * the sign, so tiny negatives never show as "-£0".
 */
export function formatMoney(amount: number, currency: string): string {
  const pennies = Math.round(amount * 100)
  const abs = Math.abs(pennies) / 100
  const whole = pennies % 100 === 0
  const digits = abs.toLocaleString('en-GB', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })
  return `${pennies < 0 ? '-' : ''}${currency}${digits}`
}

/** "£400" / "£12.75" for currency symbols, "2.5 hours" for word units, "3" with no unit. */
export function withUnit(n: number, unit: string): string {
  if (!unit) return trim(n)
  return isCurrency(unit) ? formatMoney(n, unit) : `${trim(n)} ${unit}`
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
