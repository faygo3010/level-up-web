import type { DateKey, GoalPeriod, Weekday } from './types.js'

const pad = (n: number): string => String(n).padStart(2, '0')

/** Local calendar date of a Date as YYYY-MM-DD. */
export function toDateKey(date: Date): DateKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Calendar date right now in an IANA time zone (e.g. "Europe/London"); UTC if unknown. */
export function todayIn(timeZone: string | undefined, now: Date = new Date()): DateKey {
  const format = (tz: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  try {
    return format(timeZone ?? 'UTC')
  } catch {
    return format('UTC')
  }
}

export function today(): DateKey {
  return toDateKey(new Date())
}

/** Date keys are calendar dates; do arithmetic in UTC so DST never shifts a day. */
function toUtc(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
}

function fromUtc(date: Date): DateKey {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = toUtc(key)
  d.setUTCDate(d.getUTCDate() + days)
  return fromUtc(d)
}

export function weekdayOf(key: DateKey): Weekday {
  return toUtc(key).getUTCDay() as Weekday
}

export function monthKey(key: DateKey): string {
  return key.slice(0, 7)
}

/** Inclusive list of dates from start to end (empty if end < start). */
export function dateRange(start: DateKey, end: DateKey): DateKey[] {
  const out: DateKey[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}

export interface DateSpan {
  readonly start: DateKey
  readonly end: DateKey
}

export function periodRange(key: DateKey, period: GoalPeriod, weekStartsOn: 0 | 1): DateSpan {
  const d = toUtc(key)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  switch (period) {
    case 'daily':
      return { start: key, end: key }
    case 'weekly': {
      const offset = (d.getUTCDay() - weekStartsOn + 7) % 7
      const start = addDays(key, -offset)
      return { start, end: addDays(start, 6) }
    }
    case 'monthly':
      return { start: fromUtc(new Date(Date.UTC(y, m, 1))), end: fromUtc(new Date(Date.UTC(y, m + 1, 0))) }
    case 'yearly':
      return { start: `${y}-01-01`, end: `${y}-12-31` }
  }
}

/** Friendly label like "Tue 24 Nov". */
export function formatDay(key: DateKey): string {
  return toUtc(key).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}
