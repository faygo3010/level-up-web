import { AREA_COLORS } from './defaults.js'
import type { AppState, Area, DateKey, Goal, Routine, Rule, Weekday } from './types.js'

/**
 * Ready-made pieces offered during first-run setup. Ids are fixed so two
 * devices that set up the same thing merge cleanly instead of duplicating.
 */

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5]
const EVERY_DAY: Weekday[] = [0, 1, 2, 3, 4, 5, 6]

/** Written where the user's currency symbol goes. */
const CUR = '{cur}'

export interface GoalTemplate extends Omit<Goal, 'areaId' | 'archived'> {}
export interface RoutineTemplate extends Omit<Routine, 'areaId' | 'archived'> {}
export interface RuleTemplate extends Omit<Rule, 'areaId' | 'archived'> {}

export interface AreaTemplate {
  readonly id: string
  readonly name: string
  readonly icon: string
  readonly color: string
  readonly blurb: string
  readonly goals: readonly GoalTemplate[]
  readonly routines: readonly RoutineTemplate[]
  readonly rules: readonly RuleTemplate[]
}

const g = (id: string, title: string, period: Goal['period'], target: number, unit: string, direction: Goal['direction'] = 'atLeast', tracks?: Goal['tracks']): GoalTemplate => ({
  id,
  title,
  period,
  target,
  unit,
  direction,
  ...(tracks && { tracks }),
})
const r = (id: string, title: string, timeOfDay: Routine['timeOfDay'], days: Weekday[], completedBy?: Routine['completedBy']): RoutineTemplate => ({
  id,
  title,
  timeOfDay,
  days,
  ...(completedBy && { completedBy }),
})

export const AREA_TEMPLATES: readonly AreaTemplate[] = [
  {
    id: 'work',
    name: 'Work',
    icon: '💼',
    color: '#7dd3fc',
    blurb: 'Focus, priorities, getting the important things done',
    goals: [g('g-deep', 'Deep work hours', 'weekly', 10, 'hours'), g('g-ship', 'Key tasks finished', 'weekly', 5, 'tasks')],
    routines: [
      r('work-plan', 'Plan top 3 priorities', 'morning', WEEKDAYS),
      r('work-deep', '90 min deep work block', 'anytime', WEEKDAYS),
      r('work-shutdown', 'Shutdown review', 'evening', WEEKDAYS),
    ],
    rules: [
      { id: 'work-phone', text: 'No phone during deep work' },
      { id: 'work-inbox', text: 'Check email at set times only' },
    ],
  },
  {
    id: 'fitness',
    name: 'Fitness',
    icon: '🏋️',
    color: '#86efac',
    blurb: 'Training, steps and recovery',
    goals: [
      g('g-train', 'Training sessions', 'weekly', 4, 'sessions', 'atLeast', 'workouts'),
      g('g-minutes', 'Active minutes', 'weekly', 150, 'minutes', 'atLeast', 'workoutMinutes'),
    ],
    routines: [
      r('fit-train', 'Train', 'morning', [1, 2, 4, 5], 'workout'),
      r('fit-steps', '10k steps', 'anytime', EVERY_DAY),
      r('fit-sleep', 'In bed by 11pm', 'evening', EVERY_DAY),
    ],
    rules: [{ id: 'fit-skip', text: 'Never miss two sessions in a row' }],
  },
  {
    id: 'trading',
    name: 'Trading',
    icon: '📈',
    color: '#fcd34d',
    blurb: 'Process, risk rules and a trade journal',
    goals: [
      g('g-trades', 'Max trades per week', 'weekly', 10, 'trades', 'atMost', 'trades'),
      g('g-pnl', 'Trading P&L', 'monthly', 1000, CUR, 'atLeast', 'tradePnl'),
    ],
    routines: [
      r('trade-prep', 'Pre-market prep & levels', 'morning', WEEKDAYS),
      r('trade-journal', 'Journal every trade', 'evening', WEEKDAYS, 'trade'),
      r('trade-review', 'Weekly trade review', 'evening', [5]),
    ],
    rules: [
      { id: 'trade-risk', text: 'Max 1% account risk per trade' },
      { id: 'trade-stop', text: 'Stop loss set before entry' },
      { id: 'trade-daily-loss', text: 'Stop trading after 2 losses in a day' },
    ],
  },
  {
    id: 'finance',
    name: 'Finance',
    icon: '💰',
    color: '#c4b5fd',
    blurb: 'Spending, saving and staying on budget',
    goals: [
      g('g-spend', 'Discretionary spending', 'monthly', 400, CUR, 'atMost', 'spending'),
      g('g-save', 'Saved this month', 'monthly', 500, CUR),
    ],
    routines: [r('fin-log', 'Log spending', 'evening', EVERY_DAY, 'money'), r('fin-budget', 'Weekly budget check', 'evening', [0])],
    rules: [
      { id: 'fin-impulse', text: `Wait 48h before any non-essential purchase over ${CUR}100` },
      { id: 'fin-save', text: 'Pay yourself first on payday' },
    ],
  },
  {
    id: 'health',
    name: 'Health',
    icon: '🍎',
    color: '#f9a8d4',
    blurb: 'Food, sleep and how you feel',
    goals: [g('g-sleep', 'Nights with 7h+ sleep', 'weekly', 5, 'nights')],
    routines: [r('health-water', 'Drink 2L of water', 'anytime', EVERY_DAY), r('health-cook', 'Cook a healthy meal', 'evening', EVERY_DAY)],
    rules: [{ id: 'health-alcohol', text: 'No alcohol on weeknights' }],
  },
  {
    id: 'learning',
    name: 'Learning',
    icon: '📚',
    color: '#fdba74',
    blurb: 'Reading, courses and new skills',
    goals: [g('g-study', 'Study hours', 'weekly', 5, 'hours'), g('g-books', 'Books finished', 'yearly', 12, 'books')],
    routines: [r('learn-read', 'Read 20 pages', 'evening', EVERY_DAY), r('learn-study', '30 min study', 'anytime', WEEKDAYS)],
    rules: [{ id: 'learn-notes', text: 'Write notes on what you learn' }],
  },
  {
    id: 'mindset',
    name: 'Mindset',
    icon: '🧘',
    color: '#5eead4',
    blurb: 'Calm, focus and gratitude',
    goals: [g('g-meditate', 'Meditation days', 'weekly', 6, 'days')],
    routines: [
      r('mind-meditate', 'Meditate 10 min', 'morning', EVERY_DAY),
      r('mind-gratitude', 'Write 3 things you are grateful for', 'evening', EVERY_DAY),
    ],
    rules: [{ id: 'mind-scroll', text: 'No social media in the first hour of the day' }],
  },
]

export const CURRENCIES = ['£', '$', '€', '₹', '¥', 'A$', 'C$'] as const

/** Swap the currency placeholder for the user's symbol. */
export const withCurrency = (text: string, currency: string): string => text.split(CUR).join(currency)

export interface SetupChoices {
  readonly name: string
  readonly currency: string
  readonly weekStartsOn: 0 | 1
  /** Ids of ready-made areas picked. */
  readonly areas: readonly string[]
  /** Names of areas the user typed in themselves. */
  readonly customAreas: readonly string[]
  /** Picked goal id -> target. */
  readonly goals: Readonly<Record<string, number>>
  readonly routines: readonly string[]
  readonly rules: readonly string[]
}

/** The default picks for a set of areas: every suggestion on, at its suggested target. */
export function defaultPicks(areaIds: readonly string[]): Pick<SetupChoices, 'goals' | 'routines' | 'rules'> {
  const chosen = AREA_TEMPLATES.filter((a) => areaIds.includes(a.id))
  return {
    goals: Object.fromEntries(chosen.flatMap((a) => a.goals.map((x) => [x.id, x.target]))),
    routines: chosen.flatMap((a) => a.routines.map((x) => x.id)),
    rules: chosen.flatMap((a) => a.rules.map((x) => x.id)),
  }
}

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'area'

/** Has this account been set up? Older accounts made before setup existed count once they have any areas. */
export function isOnboarded(state: AppState): boolean {
  return state.settings.onboardedAt !== undefined || state.areas.length > 0
}

/** Turn setup answers into the user's system, keeping anything already in the state. */
export function buildSystem(state: AppState, choices: SetupChoices, today: DateKey, now: number): AppState {
  const cur = choices.currency
  const picked = AREA_TEMPLATES.filter((a) => choices.areas.includes(a.id))
  const used = new Set([...state.areas.map((a) => a.id), ...picked.map((a) => a.id)])
  const custom: Area[] = []
  for (const raw of choices.customAreas) {
    const name = raw.trim().slice(0, 40)
    if (!name) continue
    let id = `custom-${slug(name)}`
    for (let n = 2; used.has(id); n++) id = `custom-${slug(name)}-${n}`
    used.add(id)
    custom.push({ id, name, icon: '⭐', color: AREA_COLORS[(picked.length + custom.length) % AREA_COLORS.length]!, archived: false })
  }

  const areas: Area[] = [...picked.map((a) => ({ id: a.id, name: a.name, icon: a.icon, color: a.color, archived: false })), ...custom]
  const goals: Goal[] = picked.flatMap((a) =>
    a.goals.flatMap((t) => {
      const target = choices.goals[t.id]
      if (target === undefined || !Number.isFinite(target) || target <= 0) return []
      return [{ ...t, areaId: a.id, target, unit: withCurrency(t.unit, cur), archived: false }]
    }),
  )
  const routines: Routine[] = picked.flatMap((a) => a.routines.filter((t) => choices.routines.includes(t.id)).map((t) => ({ ...t, areaId: a.id, archived: false })))
  const rules: Rule[] = picked.flatMap((a) =>
    a.rules.filter((t) => choices.rules.includes(t.id)).map((t) => ({ ...t, text: withCurrency(t.text, cur), areaId: a.id, archived: false })),
  )

  const add = <T extends { id: string }>(have: readonly T[], extra: readonly T[]): T[] => {
    const ids = new Set(have.map((x) => x.id))
    return [...have, ...extra.filter((x) => !ids.has(x.id))]
  }
  const name = choices.name.trim().slice(0, 60)
  return {
    ...state,
    areas: add(state.areas, areas),
    goals: add(state.goals, goals),
    routines: add(state.routines, routines),
    rules: add(state.rules, rules),
    settings: { ...state.settings, currency: cur, weekStartsOn: choices.weekStartsOn, onboardedAt: now, ...(name && { name }) },
    startedOn: state.startedOn ?? today,
  }
}
