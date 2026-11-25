import { z } from 'zod'
import { areaAdherence, bestStreak, currentStreak, dayScore, scheduledRoutines } from '../../../app/src/core/adherence'
import { addDays, formatDay, monthKey, periodRange } from '../../../app/src/core/dates'
import { describeDays, withUnit } from '../../../app/src/core/format'
import { goalProgress } from '../../../app/src/core/progress'
import { moneySummary, tradeStats, workoutSummary } from '../../../app/src/core/stats'
import type { AppState, DateKey, Goal, LogEntry } from '../../../app/src/core/types'
import { areaName, dateArg, defineTool, findArea, type ToolContext } from './shared'

const pct = (r: number | null) => (r === null ? 'n/a' : `${Math.round(r * 100)}%`)
const money = (n: number, c: string) => `${n < 0 ? '-' : ''}${c}${Math.abs(n).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`

const PER: Record<Goal['period'], string> = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }
const PERIOD_WORD: Record<Goal['period'], string> = { daily: 'today', weekly: 'this week', monthly: 'this month', yearly: 'this year' }

export function goalLine(state: AppState, goal: Goal, date: DateKey): string {
  const p = goalProgress(goal, state.goalEntries, date, state.settings.weekStartsOn)
  const status = { done: 'done', onTrack: 'on track', behind: 'behind pace', over: 'OVER budget' }[p.status]
  const kind = goal.direction === 'atMost' ? ' (budget: stay under)' : ''
  return `${goal.title}: ${withUnit(p.current, '')} / ${withUnit(goal.target, goal.unit)} ${PERIOD_WORD[goal.period]}${kind}, ${status} (id: ${goal.id})`
}

function todayText(state: AppState, date: DateKey): string {
  const routines = scheduledRoutines(state, date)
  const done = new Set(state.completions[date] ?? [])
  const checks = state.ruleChecks[date] ?? {}
  const rules = state.rules.filter((r) => !r.archived)
  const goals = state.goals.filter((g) => !g.archived)
  const score = dayScore(state, date)

  const lines = [
    `${formatDay(date)} (${date}). ${score.done} of ${score.total} done. Current streak: ${currentStreak(state, date)} days.`,
  ]
  for (const slot of ['morning', 'anytime', 'evening'] as const) {
    const items = routines.filter((r) => r.timeOfDay === slot)
    if (items.length === 0) continue
    lines.push('', `${slot === 'anytime' ? 'During the day' : slot[0]!.toUpperCase() + slot.slice(1)}:`)
    for (const r of items) lines.push(`- [${done.has(r.id) ? 'x' : ' '}] ${r.title} (${areaName(state, r.areaId)}) — id: ${r.id}`)
  }
  if (routines.length === 0) lines.push('', 'No routines scheduled on this day.')
  if (rules.length) {
    lines.push('', 'Rules check:')
    for (const r of rules) {
      const status = checks[r.id] === true ? 'KEPT' : checks[r.id] === false ? 'BROKEN' : 'not reviewed'
      lines.push(`- ${status}: ${r.text} (id: ${r.id})`)
    }
  }
  if (goals.length) {
    lines.push('', 'Goals:')
    for (const g of goals) lines.push(`- ${goalLine(state, g, date)}`)
  }
  return lines.join('\n')
}

function archivedText(state: AppState): string {
  const rows = [
    ...state.areas.filter((x) => x.archived).map((x) => `- area: ${x.name} (id: ${x.id})`),
    ...state.routines.filter((x) => x.archived).map((x) => `- routine: ${x.title} (id: ${x.id})`),
    ...state.rules.filter((x) => x.archived).map((x) => `- rule: ${x.text} (id: ${x.id})`),
    ...state.goals.filter((x) => x.archived).map((x) => `- goal: ${x.title} (id: ${x.id})`),
  ]
  return ['Archived (restore with restore_item):', ...(rows.length ? rows : ['- nothing archived'])].join('\n')
}

function systemText(state: AppState, areaQuery: string | undefined): string {
  const areas = areaQuery ? [findArea(state, areaQuery)] : state.areas.filter((a) => !a.archived)
  if (areas.length === 0) return 'No areas yet. Add one with add_area.'
  const s = state.settings
  const header = `Settings: currency ${s.currency}, week starts ${s.weekStartsOn ? 'Monday' : 'Sunday'}, a day counts for the streak at ${pct(s.streakThreshold)}, time zone ${s.timeZone ?? 'not set (UTC)'}.`
  const blocks = areas.map((a) => {
    const routines = state.routines.filter((r) => r.areaId === a.id && !r.archived)
    const rules = state.rules.filter((r) => r.areaId === a.id && !r.archived)
    const goals = state.goals.filter((g) => g.areaId === a.id && !g.archived)
    return [
      `## ${a.icon} ${a.name} (id: ${a.id})`,
      'Routines:',
      ...(routines.length ? routines.map((r) => `- ${r.title} — ${describeDays(r.days)}, ${r.timeOfDay} (id: ${r.id})`) : ['- none']),
      'Rules:',
      ...(rules.length ? rules.map((r) => `- ${r.text} (id: ${r.id})`) : ['- none']),
      'Goals:',
      ...(goals.length
        ? goals.map((g) => `- ${g.title}: ${g.direction === 'atMost' ? 'at most' : 'at least'} ${withUnit(g.target, g.unit)} per ${PER[g.period]} (id: ${g.id})`)
        : ['- none']),
    ].join('\n')
  })
  return [header, ...blocks].join('\n\n')
}

export function logLine(state: AppState, l: LogEntry): string {
  const c = state.settings.currency
  const detail = (() => {
    switch (l.kind) {
      case 'trade':
        return `Trade ${l.trade.symbol || '?'} ${l.trade.side}, P&L ${money(l.trade.pnl, c)}, ${l.trade.followedPlan ? 'followed plan' : 'BROKE plan'}`
      case 'workout':
        return `Workout ${l.workout.activity}, ${l.workout.minutes} min`
      case 'money':
        return `${l.money.amount < 0 ? 'Spent' : 'Received'} ${money(Math.abs(l.money.amount), c)} (${l.money.category})`
      case 'note':
        return 'Note'
    }
  })()
  return `- ${l.date} · ${detail}${l.text ? ` — ${l.text}` : ''} [${areaName(state, l.areaId)}] (id: ${l.id})`
}

function insightsText(state: AppState, today: DateKey): string {
  const c = state.settings.currency
  const month = periodRange(today, 'monthly', state.settings.weekStartsOn)
  const trades = tradeStats(state.logs, month.start, month.end)
  const cash = moneySummary(state.logs, monthKey(today))
  const work = workoutSummary(state.logs, month.start, month.end)
  const lines = [
    `Current streak: ${currentStreak(state, today)} days. Best in the last year: ${bestStreak(state, addDays(today, -364), today)} days.`,
    '',
    'Adherence by area (last 7 days / 30 days):',
    ...state.areas
      .filter((a) => !a.archived)
      .map((a) => `- ${a.name}: ${pct(areaAdherence(state, a.id, today, 7))} / ${pct(areaAdherence(state, a.id, today, 30))}`),
    '',
    `Trading this month: ${trades.count} trades, win rate ${pct(trades.winRate)}, P&L ${money(trades.totalPnl, c)}.`,
    `On-plan trades: ${trades.followed.count} (P&L ${money(trades.followed.pnl, c)}). Off-plan trades: ${trades.broken.count} (P&L ${money(trades.broken.pnl, c)}).`,
    `Money this month: in ${money(cash.income, c)}, out ${money(cash.spending, c)}, net ${money(cash.net, c)}.`,
    ...(cash.byCategory.length ? [`Top spending: ${cash.byCategory.slice(0, 5).map((x) => `${x.category} ${money(x.total, c)}`).join(', ')}.`] : []),
    `Workouts this month: ${work.sessions} sessions, ${work.minutes} minutes.`,
  ]
  return lines.join('\n')
}

const resolveReadDate = (date: string | undefined, ctx: ToolContext) => date ?? ctx.today

export const readTools = [
  defineTool({
    name: 'get_today',
    title: "Today's schedule",
    description:
      "The user's plan for a day: routines to do (with done/not done), playbook rules to review, and progress on every goal. Use this first when the user asks what to do, what's left, or how today is going.",
    access: 'read',
    input: { date: dateArg },
    run: (state, { date }, ctx) => ({ text: todayText(state, resolveReadDate(date, ctx)) }),
  }),
  defineTool({
    name: 'get_system',
    title: 'Life system overview',
    description:
      "The user's whole system: life areas, each area's routines (with days and time of day), playbook rules and goals, plus settings. Includes the ids needed by the editing tools.",
    access: 'read',
    input: {
      area: z.string().trim().max(200).optional().describe('Limit to one area (id or name).'),
      include_archived: z.boolean().default(false).describe('Also list archived items with their ids.'),
    },
    run: (state, { area, include_archived }) => ({
      text: include_archived ? `${systemText(state, area)}\n\n${archivedText(state)}` : systemText(state, area),
    }),
  }),
  defineTool({
    name: 'get_journal',
    title: 'Journal entries',
    description: 'Recent journal entries: trades (with P&L and whether the plan was followed), workouts, money in/out and notes. Newest first.',
    access: 'read',
    input: {
      kind: z.enum(['trade', 'workout', 'money', 'note']).optional(),
      from: dateArg.describe('Earliest date, YYYY-MM-DD.'),
      to: dateArg.describe('Latest date, YYYY-MM-DD.'),
      limit: z.number().int().min(1).max(200).default(30),
    },
    run: (state, { kind, from, to, limit }) => {
      const items = state.logs
        .filter((l) => (!kind || l.kind === kind) && (!from || l.date >= from) && (!to || l.date <= to))
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
        .slice(0, limit)
      return { text: items.length ? items.map((l) => logLine(state, l)).join('\n') : 'No journal entries match.' }
    },
  }),
  defineTool({
    name: 'get_insights',
    title: 'Progress insights',
    description:
      'How well the user is following their system: streaks, adherence per area, this month’s trading results split by on-plan vs off-plan trades, money in/out, and workouts.',
    access: 'read',
    input: {},
    run: (state, _args, ctx) => ({ text: insightsText(state, ctx.today) }),
  }),
]
