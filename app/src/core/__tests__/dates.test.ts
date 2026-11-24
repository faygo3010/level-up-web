import { addDays, dateRange, periodRange, toDateKey, todayIn, weekdayOf, monthKey } from '../dates'

describe('dates', () => {
  it('formats a local date as YYYY-MM-DD with zero padding', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('adds and subtracts days across month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('returns the weekday (0 = Sunday)', () => {
    expect(weekdayOf('2026-11-22')).toBe(0)
    expect(weekdayOf('2026-11-24')).toBe(2)
  })

  it('returns the month key', () => {
    expect(monthKey('2026-11-24')).toBe('2026-11')
  })

  it('lists every date in an inclusive range', () => {
    expect(dateRange('2026-02-27', '2026-03-02')).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ])
    expect(dateRange('2026-03-02', '2026-03-01')).toEqual([])
  })

  describe('periodRange', () => {
    it('daily is the day itself', () => {
      expect(periodRange('2026-11-24', 'daily', 1)).toEqual({ start: '2026-11-24', end: '2026-11-24' })
    })

    it('weekly respects a Monday week start', () => {
      expect(periodRange('2026-11-24', 'weekly', 1)).toEqual({ start: '2026-11-23', end: '2026-11-29' })
      expect(periodRange('2026-11-22', 'weekly', 1)).toEqual({ start: '2026-11-16', end: '2026-11-22' })
    })

    it('weekly respects a Sunday week start', () => {
      expect(periodRange('2026-11-24', 'weekly', 0)).toEqual({ start: '2026-11-22', end: '2026-11-28' })
    })

    it('monthly covers the calendar month', () => {
      expect(periodRange('2026-02-10', 'monthly', 1)).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    })

    it('yearly covers the calendar year', () => {
      expect(periodRange('2026-06-10', 'yearly', 1)).toEqual({ start: '2026-01-01', end: '2026-12-31' })
    })
  })
})

describe('todayIn', () => {
  const instant = new Date('2026-11-24T23:30:00Z')
  it('returns the calendar date in a given time zone', () => {
    expect(todayIn('Europe/London', instant)).toBe('2026-11-24')
    expect(todayIn('Asia/Tokyo', instant)).toBe('2026-11-25')
    expect(todayIn('America/Los_Angeles', instant)).toBe('2026-11-24')
  })
  it('falls back to UTC for a missing or invalid zone', () => {
    expect(todayIn(undefined, instant)).toBe('2026-11-24')
    expect(todayIn('Not/AZone', instant)).toBe('2026-11-24')
  })
})
