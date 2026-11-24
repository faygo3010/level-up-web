import { routinesToIcs } from '../calendar'
import { routine, stateWith } from './fixtures'

const NOW = new Date('2026-11-24T10:00:00Z')

describe('routinesToIcs', () => {
  const state = stateWith({
    areas: [{ id: 'fitness', name: 'Fitness', icon: '', color: '', archived: false }],
    routines: [
      routine({ id: 'r1', title: 'Train, hard; then stretch', days: [1, 3, 5], timeOfDay: 'morning' }),
      routine({ id: 'r2', title: 'Walk', days: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'evening' }),
      routine({ id: 'gone', title: 'Old', archived: true }),
    ],
  })
  const ics = routinesToIcs(state, '2026-11-24', NOW)
  const lines = ics.split('\r\n')

  it('is a valid calendar with one weekly repeating event per active routine', () => {
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(lines).toContain('VERSION:2.0')
    expect(lines.at(-2)).toBe('END:VCALENDAR')
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(2)
    expect(ics).not.toContain('Old')
  })

  it('repeats on the routine’s days at its time of day', () => {
    expect(lines).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR')
    expect(lines).toContain('RRULE:FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH,FR,SA')
    // Today is Tuesday 24th, so a Mon/Wed/Fri routine first occurs on Wednesday 25th.
    expect(lines).toContain('DTSTART:20261125T070000')
    expect(lines).toContain('DTSTART:20261124T190000')
    expect(lines).toContain('DURATION:PT30M')
  })

  it('escapes text, names the area and uses stable ids', () => {
    expect(lines).toContain(String.raw`SUMMARY:Train\, hard\; then stretch (Fitness)`)
    expect(lines).toContain('UID:r1@levelup')
    expect(lines).toContain('DTSTAMP:20261124T100000Z')
  })

  it('folds long lines at 75 octets', () => {
    const long = routinesToIcs(stateWith({ routines: [routine({ title: 'x'.repeat(200) })] }), '2026-11-24', NOW)
    expect(long.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true)
  })
})
