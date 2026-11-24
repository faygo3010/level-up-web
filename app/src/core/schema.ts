import { z } from 'zod'
import { DEFAULT_SETTINGS } from './defaults'

/** Runtime validation for imported backups and persisted state. */

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const id = z.string().min(1).max(100)
const text = z.string().max(2000)
const weekday = z.number().int().min(0).max(6)

const area = z.object({ id, name: text, icon: z.string().max(16), color: z.string().max(32), archived: z.boolean() })

const routine = z.object({
  id,
  areaId: id,
  title: text,
  days: z.array(weekday).max(7),
  timeOfDay: z.enum(['morning', 'anytime', 'evening']),
  archived: z.boolean(),
})

const goal = z.object({
  id,
  areaId: id,
  title: text,
  period: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  target: z.number().finite().min(0),
  unit: z.string().max(32),
  direction: z.enum(['atLeast', 'atMost']),
  archived: z.boolean(),
})

const goalEntry = z.object({ id, goalId: id, date: dateKey, value: z.number().finite() })

const rule = z.object({ id, areaId: id, text, archived: z.boolean() })

const logBase = { id, areaId: id, date: dateKey, text, createdAt: z.number() }

const logEntry = z.discriminatedUnion('kind', [
  z.object({ ...logBase, kind: z.literal('note') }),
  z.object({
    ...logBase,
    kind: z.literal('trade'),
    trade: z.object({
      symbol: z.string().max(32),
      side: z.enum(['long', 'short']),
      pnl: z.number().finite(),
      followedPlan: z.boolean(),
    }),
  }),
  z.object({
    ...logBase,
    kind: z.literal('workout'),
    workout: z.object({ activity: z.string().max(64), minutes: z.number().finite().min(0) }),
  }),
  z.object({
    ...logBase,
    kind: z.literal('money'),
    money: z.object({ amount: z.number().finite(), category: z.string().max(64) }),
  }),
])

const settings = z.object({
  currency: z.string().min(1).max(4),
  streakThreshold: z.number().min(0).max(1),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
})

export const appStateSchema = z.object({
  version: z.literal(1),
  areas: z.array(area),
  routines: z.array(routine),
  goals: z.array(goal),
  goalEntries: z.array(goalEntry),
  rules: z.array(rule),
  logs: z.array(logEntry),
  completions: z.record(dateKey, z.array(id)),
  ruleChecks: z.record(dateKey, z.record(id, z.boolean())),
  settings: settings.default(DEFAULT_SETTINGS),
})
