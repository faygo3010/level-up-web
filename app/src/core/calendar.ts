import { addDays, weekdayOf } from './dates.js'
import type { AppState, DateKey, TimeOfDay } from './types.js'

/**
 * Export routines as an iCalendar (.ics) file so they show up in Google,
 * Apple or Outlook calendars as weekly repeating events. Times are "floating"
 * local times, so they stay at 07:00 wherever the user is.
 */

const START: Record<TimeOfDay, string> = { morning: '070000', anytime: '120000', evening: '190000' }
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const

/** RFC 5545 text escaping. */
const escapeText = (s: string) =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    // Every line-break form, including a bare CR some calendar apps treat as a new line.
    .replace(/\r\n|\r|\n/g, '\\n')
    // Strip remaining control characters so no property can be injected.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')

/** Fold lines longer than 75 octets (RFC 5545 §3.1), never splitting a character. */
function fold(line: string): string {
  const enc = new TextEncoder()
  const parts: string[] = []
  let current = ''
  for (const ch of line) {
    const limit = parts.length === 0 ? 75 : 74 // continuation lines start with a space
    if (enc.encode(current + ch).length > limit) {
      parts.push(current)
      current = ch
    } else current += ch
  }
  parts.push(current)
  return parts.join('\r\n ')
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** First date on or after `from` that falls on one of the routine's days. */
function firstOccurrence(from: DateKey, days: readonly number[]): DateKey {
  let d = from
  for (let i = 0; i < 7 && !days.includes(weekdayOf(d)); i++) d = addDays(d, 1)
  return d
}

export function routinesToIcs(state: AppState, from: DateKey, now: Date = new Date()): string {
  const areaName = new Map(state.areas.map((a) => [a.id, a.name]))
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Level Up//Routines//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Level Up routines']
  for (const r of state.routines) {
    if (r.archived || r.days.length === 0) continue
    const area = areaName.get(r.areaId)
    lines.push(
      'BEGIN:VEVENT',
      `UID:${r.id}@levelup`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${firstOccurrence(from, r.days).replace(/-/g, '')}T${START[r.timeOfDay]}`,
      'DURATION:PT30M',
      `RRULE:FREQ=WEEKLY;BYDAY=${[...r.days].sort().map((d) => BYDAY[d]).join(',')}`,
      `SUMMARY:${escapeText(area ? `${r.title} (${area})` : r.title)}`,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
