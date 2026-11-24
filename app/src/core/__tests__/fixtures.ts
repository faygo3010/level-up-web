import type { AppState, Goal, Routine, Rule } from '../types'
import { emptyState } from '../defaults'

export const routine = (over: Partial<Routine> = {}): Routine => ({
  id: 'r1',
  areaId: 'fitness',
  title: 'Train',
  days: [0, 1, 2, 3, 4, 5, 6],
  timeOfDay: 'morning',
  archived: false,
  ...over,
})

export const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  areaId: 'fitness',
  title: 'Run',
  period: 'weekly',
  target: 4,
  unit: 'runs',
  direction: 'atLeast',
  archived: false,
  ...over,
})

export const rule = (over: Partial<Rule> = {}): Rule => ({
  id: 'x1',
  areaId: 'trading',
  text: 'Max 1% risk',
  archived: false,
  ...over,
})

export const stateWith = (over: Partial<AppState> = {}): AppState => ({
  ...emptyState(),
  ...over,
})
