import type { AppState, Area, DateKey, Goal, Routine, Rule, Settings, Weekday } from './types'

export const DEFAULT_SETTINGS: Settings = {
  currency: '£',
  streakThreshold: 0.8,
  weekStartsOn: 1,
}

export const AREA_COLORS = ['#7dd3fc', '#86efac', '#fcd34d', '#c4b5fd', '#f9a8d4', '#fdba74', '#5eead4'] as const

export function emptyState(): AppState {
  return {
    version: 1,
    areas: [],
    routines: [],
    goals: [],
    goalEntries: [],
    rules: [],
    logs: [],
    completions: {},
    ruleChecks: {},
    memories: [],
    forgottenMemoryIds: [],
    tombstones: [],
    settings: DEFAULT_SETTINGS,
  }
}

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5]
const EVERY_DAY: Weekday[] = [0, 1, 2, 3, 4, 5, 6]

const area = (id: string, name: string, icon: string, color: string): Area => ({ id, name, icon, color, archived: false })

const routine = (
  id: string,
  areaId: string,
  title: string,
  timeOfDay: Routine['timeOfDay'],
  days: Weekday[],
  completedBy?: Routine['completedBy'],
): Routine => ({ id, areaId, title, timeOfDay, days, archived: false, ...(completedBy && { completedBy }) })

const rule = (id: string, areaId: string, text: string): Rule => ({ id, areaId, text, archived: false })

const goal = (
  id: string,
  areaId: string,
  title: string,
  period: Goal['period'],
  target: number,
  unit: string,
  direction: Goal['direction'] = 'atLeast',
  tracks?: Goal['tracks'],
): Goal => ({ id, areaId, title, period, target, unit, direction, archived: false, ...(tracks && { tracks }) })

/**
 * A starter system across the four core areas. Everything is editable; it
 * exists so the first screen isn't empty and shows how the pieces fit.
 */
export function starterState(today: DateKey): AppState {
  return {
    ...emptyState(),
    startedOn: today,
    areas: [
      area('work', 'Work', '💼', '#7dd3fc'),
      area('fitness', 'Fitness', '🏋️', '#86efac'),
      area('trading', 'Trading', '📈', '#fcd34d'),
      area('finance', 'Finance', '💷', '#c4b5fd'),
    ],
    routines: [
      routine('work-plan', 'work', 'Plan top 3 priorities', 'morning', WEEKDAYS),
      routine('work-deep', 'work', '90 min deep work block', 'anytime', WEEKDAYS),
      routine('work-shutdown', 'work', 'Shutdown review', 'evening', WEEKDAYS),
      routine('fit-train', 'fitness', 'Train', 'morning', [1, 2, 4, 5], 'workout'),
      routine('fit-steps', 'fitness', '10k steps', 'anytime', EVERY_DAY),
      routine('trade-prep', 'trading', 'Pre-market prep & levels', 'morning', WEEKDAYS),
      routine('trade-journal', 'trading', 'Journal every trade', 'evening', WEEKDAYS, 'trade'),
      routine('fin-log', 'finance', 'Log spending', 'evening', EVERY_DAY, 'money'),
    ],
    rules: [
      rule('trade-risk', 'trading', 'Max 1% account risk per trade'),
      rule('trade-stop', 'trading', 'Stop loss set before entry'),
      rule('trade-daily-loss', 'trading', 'Stop trading after 2 losses in a day'),
      rule('fin-impulse', 'finance', 'Wait 48h before any non-essential purchase over £100'),
      rule('work-phone', 'work', 'No phone during deep work'),
    ],
    goals: [
      goal('g-train', 'fitness', 'Training sessions', 'weekly', 4, 'sessions', 'atLeast', 'workouts'),
      goal('g-deep', 'work', 'Deep work hours', 'weekly', 10, 'hours'),
      goal('g-spend', 'finance', 'Discretionary spending', 'monthly', 400, '£', 'atMost', 'spending'),
      goal('g-save', 'finance', 'Saved this month', 'monthly', 500, '£'),
    ],
  }
}
