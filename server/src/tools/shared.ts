import { z } from 'zod'
import type { AppState, Area, DateKey, Weekday } from '../../../app/src/core/types'

export interface ToolContext {
  /** Today in the user's time zone. */
  readonly today: DateKey
  readonly now: number
  readonly newId: () => string
  /** Name of the connected app making the call, recorded on saved memories. */
  readonly source?: string
}

export interface ToolResult {
  /** What the chatbot sees. */
  readonly text: string
  /** Present only when the tool changed the user's data. */
  readonly state?: AppState
  /** One line for the user's activity history. Present for every change. */
  readonly summary?: string
}

export interface ToolDef<S extends z.ZodRawShape = z.ZodRawShape> {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly access: 'read' | 'write'
  /** Removes or archives something; chat apps ask the user before running it. */
  readonly destructive?: boolean
  /** Repeating the same call leaves the same result (safe to retry). */
  readonly idempotent?: boolean
  readonly input: S
  readonly schema: z.ZodObject<S>
  run(state: AppState, args: z.infer<z.ZodObject<S>>, ctx: ToolContext): ToolResult
}

/** An expected, user-facing failure (bad name, missing field). Shown to the chatbot as-is. */
export class ToolError extends Error {}

export function defineTool<S extends z.ZodRawShape>(def: Omit<ToolDef<S>, 'schema'>): ToolDef<S> {
  return { ...def, schema: z.object(def.input) }
}

// ── Shared input schemas ─────────────────────────────────────────────

/** A real calendar date (no 2026-02-30), from 2000 onwards. */
export const isRealDate = (d: string): boolean => {
  const t = Date.parse(`${d}T00:00:00Z`)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d && d >= '2000-01-01'
}

export const dateArg = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine(isRealDate, 'Not a real calendar date (YYYY-MM-DD, from 2000)')
  .optional()
  .describe('Date as YYYY-MM-DD. Defaults to today in the user’s time zone.')

export const nameArg = (thing: string) =>
  z.string().trim().min(1).max(200).describe(`The ${thing}'s id, or its name (a unique part of the name is enough).`)

/** Money, P&L, minutes and goal amounts: finite and bounded so totals can't overflow. */
export const amountArg = z.number().finite().min(-1e9).max(1e9)

/** Exactly one emoji or symbol (counted as what a person sees, not UTF-16 units). */
export const iconArg = z
  .string()
  .trim()
  .refine((s) => [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s)].length === 1, 'Use exactly one emoji')

export const shortText = (max = 200) => z.string().trim().min(1).max(max)

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export const daysArg = z
  .union([z.enum(['daily', 'weekdays', 'weekends']), z.array(z.enum(DAY_KEYS)).min(1).max(7)])
  .describe('"daily", "weekdays", "weekends", or a list like ["mon","wed","fri"].')

export function toWeekdays(days: z.infer<typeof daysArg>): Weekday[] {
  if (days === 'daily') return [0, 1, 2, 3, 4, 5, 6]
  if (days === 'weekdays') return [1, 2, 3, 4, 5]
  if (days === 'weekends') return [0, 6]
  return [...new Set(days.map((d) => DAY_KEYS.indexOf(d) as Weekday))].sort()
}

export const timeOfDayArg = z.enum(['morning', 'anytime', 'evening'])

// ── Helpers ──────────────────────────────────────────────────────────

export function resolveDate(date: string | undefined, ctx: ToolContext): DateKey {
  const d = date ?? ctx.today
  if (d > ctx.today) throw new ToolError(`${d} is in the future. You can only log today or earlier (today is ${ctx.today}).`)
  return d
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Find one active item by id, exact name, or a unique part of its name.
 * Ambiguity is an error listing the candidates, so the chatbot can ask.
 */
export function findOne<T extends { id: string; archived: boolean }>(
  items: readonly T[],
  query: string,
  label: (item: T) => string,
  kind: string,
  /** Write tools use 'exact' so a loose word can never change the wrong item. */
  mode: 'partial' | 'exact' = 'partial',
): T {
  const active = items.filter((i) => !i.archived)
  const q = norm(query)
  const byId = active.find((i) => i.id === query)
  if (byId) return byId
  const exact = active.filter((i) => norm(label(i)) === q)
  if (exact.length === 1) return exact[0]!
  if (mode === 'exact' && exact.length === 0) {
    const close = active.filter((i) => norm(label(i)).includes(q)).slice(0, 5)
    const hint = close.length ? ` Did you mean: ${close.map((i) => `${label(i)} (id: ${i.id})`).join('; ')}?` : ` Options: ${active.map(label).slice(0, 20).join('; ') || 'none yet'}.`
    throw new ToolError(`No ${kind} is called "${query}".${hint} Use the exact name or the id.`)
  }
  const partial = exact.length > 1 ? exact : active.filter((i) => norm(label(i)).includes(q))
  if (partial.length === 1) return partial[0]!
  if (partial.length === 0) {
    const options = active.map(label).slice(0, 20).join('; ') || 'none yet'
    throw new ToolError(`No ${kind} matches "${query}". Options: ${options}.`)
  }
  const options = partial.map((i) => `${label(i)} (id: ${i.id})`).join('; ')
  throw new ToolError(`"${query}" matches several ${kind}s: ${options}. Use the id or a more specific name.`)
}

export const findArea = (state: AppState, q: string, mode: 'partial' | 'exact' = 'partial'): Area =>
  findOne(state.areas, q, (a) => a.name, 'area', mode)

export function areaName(state: AppState, id: string): string {
  return state.areas.find((a) => a.id === id)?.name ?? 'Unknown area'
}

/** Pick the area that best matches a journal entry type when none is given. */
export function defaultAreaFor(state: AppState, hint: string): Area {
  const active = state.areas.filter((a) => !a.archived)
  const area = active.find((a) => a.name.toLowerCase().includes(hint)) ?? active[0]
  if (!area) throw new ToolError('There are no areas yet. Add one first with add_area.')
  return area
}

export const quote = (s: string) => `"${s}"`
