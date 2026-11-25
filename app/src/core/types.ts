/**
 * Level Up domain model. Pure data, no platform dependencies, so the same
 * types power the web app now and the Expo app later.
 */

/** Calendar date in local time, formatted YYYY-MM-DD. */
export type DateKey = string

/** 0 = Sunday ... 6 = Saturday (matches Date#getDay). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type TimeOfDay = 'morning' | 'anytime' | 'evening'

export type GoalPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly'

/** atLeast: hit the target or more (run 4x). atMost: stay under it (spend < £500). */
export type GoalDirection = 'atLeast' | 'atMost'

export type LogKind = 'note' | 'trade' | 'workout' | 'money'

export interface Area {
  readonly id: string
  readonly name: string
  readonly icon: string
  readonly color: string
  readonly archived: boolean
}

/** A repeatable action that makes up your system (e.g. "Pre-market prep"). */
export interface Routine {
  readonly id: string
  readonly areaId: string
  readonly title: string
  readonly days: readonly Weekday[]
  readonly timeOfDay: TimeOfDay
  readonly archived: boolean
}

/** A measurable target with a progress bar. */
export interface Goal {
  readonly id: string
  readonly areaId: string
  readonly title: string
  readonly period: GoalPeriod
  readonly target: number
  readonly unit: string
  readonly direction: GoalDirection
  readonly archived: boolean
}

export interface GoalEntry {
  readonly id: string
  readonly goalId: string
  readonly date: DateKey
  readonly value: number
}

/** A written rule in your playbook (e.g. "Max 1% risk per trade"). */
export interface Rule {
  readonly id: string
  readonly areaId: string
  readonly text: string
  readonly archived: boolean
}

export interface TradeDetails {
  readonly symbol: string
  readonly side: 'long' | 'short'
  readonly pnl: number
  readonly followedPlan: boolean
}

export interface WorkoutDetails {
  readonly activity: string
  readonly minutes: number
}

export interface MoneyDetails {
  /** Positive = income, negative = spending. */
  readonly amount: number
  readonly category: string
}

interface LogBase {
  readonly id: string
  readonly areaId: string
  readonly date: DateKey
  readonly text: string
  readonly createdAt: number
}

export type LogEntry =
  | (LogBase & { readonly kind: 'note' })
  | (LogBase & { readonly kind: 'trade'; readonly trade: TradeDetails })
  | (LogBase & { readonly kind: 'workout'; readonly workout: WorkoutDetails })
  | (LogBase & { readonly kind: 'money'; readonly money: MoneyDetails })

/** Something an AI coach (or the user) saved to remember across chats. */
export interface Memory {
  readonly id: string
  readonly text: string
  /** Optional area it relates to. */
  readonly areaId?: string
  readonly createdAt: number
  /** Who saved it, e.g. "Claude" or "You". */
  readonly source: string
}

export interface Settings {
  readonly currency: string
  /** Day score (0-1) needed to count a day towards your streak. */
  readonly streakThreshold: number
  readonly weekStartsOn: 0 | 1
  /** IANA time zone, so connected AI apps know what "today" means for you. */
  readonly timeZone?: string
}

export interface AppState {
  readonly version: 1
  readonly areas: readonly Area[]
  readonly routines: readonly Routine[]
  readonly goals: readonly Goal[]
  readonly goalEntries: readonly GoalEntry[]
  readonly rules: readonly Rule[]
  readonly logs: readonly LogEntry[]
  /** date -> ids of routines completed that day */
  readonly completions: Readonly<Record<DateKey, readonly string[]>>
  /** date -> ruleId -> kept (true) or broken (false); missing = not reviewed */
  readonly ruleChecks: Readonly<Record<DateKey, Readonly<Record<string, boolean>>>>
  /** Notes connected AI apps saved to remember across chats. Visible and deletable in the app. */
  readonly memories: readonly Memory[]
  /** Ids of deleted memories, so a stale device can't sync them back (newest first, bounded). */
  readonly forgottenMemoryIds: readonly string[]
  readonly settings: Settings
  /** First day you used the system. Earlier days count as no data, not misses. */
  readonly startedOn?: DateKey
}
