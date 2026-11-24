import { z } from 'zod'
import { dayScore, scheduledRoutines } from '../../../app/src/core/adherence'
import { addDays, dateRange, periodRange } from '../../../app/src/core/dates'
import { withUnit } from '../../../app/src/core/format'
import { goalProgress } from '../../../app/src/core/progress'
import { reducer } from '../../../app/src/core/reducer'
import { tradeStats } from '../../../app/src/core/stats'
import type { AppState, DateKey, Memory } from '../../../app/src/core/types'
import { goalLine } from './read'
import { areaName, dateArg, defineTool, findArea, quote, ToolError } from './shared'

/**
 * Coaching tools adapted from awesome-ai-apps patterns:
 * - memory agents (agno_memory_agent, study_coach_agent): remember / recall / forget
 * - study coach reflection: get_weekly_review
 * - ai_expense_tracker: get_spending
 * - macro_event_brief_agent (grounded pre-trade brief): pre_trade_check
 */

const money = (n: number, c: string) => `${n < 0 ? '-' : ''}${c}${Math.abs(n).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const pct = (r: number | null) => (r === null ? 'n/a' : `${Math.round(r * 100)}%`)

function weekAdherence(state: AppState, end: DateKey): number | null {
  return avg(
    dateRange(addDays(end, -6), end)
      .map((d) => dayScore(state, d).score)
      .filter((s): s is number => s !== null),
  )
}

function memoryLine(state: AppState, m: Memory): string {
  const area = m.areaId ? ` [${areaName(state, m.areaId)}]` : ''
  return `- ${m.text}${area} (saved by ${m.source}, ${new Date(m.createdAt).toISOString().slice(0, 10)}; id: ${m.id})`
}

const memoryTools = [
  defineTool({
    name: 'remember',
    title: 'Remember something',
    description:
      'Save a short note about the user to their Level Up account so any connected AI app can recall it later: a preference, a pattern you noticed, a commitment they made. One fact per call. The user can see and delete these in the app.',
    access: 'write',
    input: {
      text: z.string().trim().min(1).max(1000),
      area: z.string().trim().max(200).optional().describe('Related area id or name, if any.'),
    },
    run: (state, a, ctx) => {
      const areaId = a.area ? findArea(state, a.area).id : undefined
      const memory: Memory = { id: ctx.newId(), text: a.text, ...(areaId && { areaId }), createdAt: ctx.now, source: ctx.source ?? 'AI app' }
      return {
        state: reducer(state, { type: 'addMemory', memory }),
        text: `Remembered: ${a.text}`,
        summary: `Remembered ${quote(a.text)}`,
      }
    },
  }),
  defineTool({
    name: 'recall',
    title: 'Recall what you know',
    description: 'List notes previously saved about the user (newest first), optionally filtered by words or area. Check this at the start of a coaching conversation.',
    access: 'read',
    input: {
      query: z.string().trim().max(200).optional(),
      area: z.string().trim().max(200).optional(),
      limit: z.number().int().min(1).max(100).default(30),
    },
    run: (state, a) => {
      const areaId = a.area ? findArea(state, a.area).id : undefined
      const q = a.query?.toLowerCase()
      const items = state.memories.filter((m) => (!q || m.text.toLowerCase().includes(q)) && (!areaId || m.areaId === areaId)).slice(0, a.limit)
      if (state.memories.length === 0) return { text: 'Nothing saved yet. Use remember to save what matters about the user.' }
      return { text: items.length ? items.map((m) => memoryLine(state, m)).join('\n') : 'No saved notes match.' }
    },
  }),
  defineTool({
    name: 'forget',
    title: 'Forget a note',
    description: 'Delete one saved note by id (from recall). Confirm with the user first.',
    access: 'write',
    destructive: true,
    input: { id: z.string().trim().min(1).max(100) },
    run: (state, { id }) => {
      const m = state.memories.find((x) => x.id === id)
      if (!m) throw new ToolError(`No memory has id ${id}. Use recall to find it.`)
      return { state: reducer(state, { type: 'removeMemory', id }), text: `Forgot: ${m.text}`, summary: `Forgot ${quote(m.text)}` }
    },
  }),
]

function weeklyReview(state: AppState, end: DateKey): string {
  const start = addDays(end, -6)
  const days = dateRange(start, end)
  const c = state.settings.currency
  const thisWeek = weekAdherence(state, end)
  const lastWeek = weekAdherence(state, addDays(end, -7))

  const broken = new Map<string, number>()
  const missed = new Map<string, { missed: number; scheduled: number }>()
  for (const d of days) {
    for (const [ruleId, kept] of Object.entries(state.ruleChecks[d] ?? {})) if (kept === false) broken.set(ruleId, (broken.get(ruleId) ?? 0) + 1)
    const done = new Set(state.completions[d] ?? [])
    for (const r of scheduledRoutines(state, d)) {
      const m = missed.get(r.id) ?? { missed: 0, scheduled: 0 }
      missed.set(r.id, { missed: m.missed + (done.has(r.id) ? 0 : 1), scheduled: m.scheduled + 1 })
    }
  }
  const ruleText = (id: string) => state.rules.find((r) => r.id === id)?.text ?? 'Unknown rule'
  const routineTitle = (id: string) => state.routines.find((r) => r.id === id)?.title ?? 'Unknown routine'
  const topBroken = [...broken.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  const topMissed = [...missed.entries()].filter(([, v]) => v.missed > 0).sort((a, b) => b[1].missed - a[1].missed).slice(0, 3)
  const trades = tradeStats(state.logs, start, end)
  const goals = state.goals.filter((g) => !g.archived)
  const budgets = goals.filter((g) => g.direction === 'atMost')

  const lines = [
    `Week ${start} to ${end}. System adherence ${pct(thisWeek)} (previous week ${pct(lastWeek)}).`,
    '',
    'Most broken rules:',
    ...(topBroken.length ? topBroken.map(([id, n]) => `- ${ruleText(id)}: broken ${n} time${n === 1 ? '' : 's'}`) : ['- none recorded']),
    '',
    'Most missed routines:',
    ...(topMissed.length ? topMissed.map(([id, v]) => `- ${routineTitle(id)}: missed ${v.missed} of ${v.scheduled}`) : ['- none missed']),
    '',
    'Goals now:',
    ...(goals.length ? goals.filter((g) => g.direction === 'atLeast').map((g) => `- ${goalLine(state, g, end)}`) : ['- no goals']),
    ...(budgets.length
      ? [
          '',
          'Budgets:',
          ...budgets.map((g) => {
            const p = goalProgress(g, state.goalEntries, end, state.settings.weekStartsOn)
            return `- ${g.title}: ${withUnit(p.current, g.unit)} of ${withUnit(g.target, g.unit)} used (${p.status === 'over' ? 'OVER' : p.status === 'behind' ? 'ahead of pace' : 'on pace'})`
          }),
        ]
      : []),
    '',
    `Trades this week: ${trades.count}, P&L ${money(trades.totalPnl, c)}. On-plan trades: ${trades.followed.count} (${money(trades.followed.pnl, c)}). Off-plan trades: ${trades.broken.count} (${money(trades.broken.pnl, c)}).`,
    '',
    'Questions to reflect on:',
    `- ${topBroken[0] ? `What triggered breaking "${ruleText(topBroken[0][0])}"?` : 'Which rule felt hardest to keep, even though you kept it?'}`,
    `- ${topMissed[0] ? `What would make "${routineTitle(topMissed[0][0])}" easier to do next week?` : 'What made this week’s routines stick?'}`,
    `- ${trades.broken.count ? 'What did off-plan trades have in common?' : 'What one change would raise next week’s adherence?'}`,
  ]
  return lines.join('\n')
}

const reviewTools = [
  defineTool({
    name: 'get_weekly_review',
    title: 'Weekly review',
    description:
      'A grounded review of the last 7 days: adherence versus the week before, most-broken rules, most-missed routines, goals and budgets, on-plan versus off-plan trades, and reflection questions. Use for weekly check-ins; cite the numbers, do not invent any.',
    access: 'read',
    input: { end_date: dateArg.describe('Last day of the week to review, YYYY-MM-DD. Defaults to today.') },
    run: (state, { end_date }, ctx) => ({ text: weeklyReview(state, end_date && end_date < ctx.today ? end_date : ctx.today) }),
  }),
  defineTool({
    name: 'get_spending',
    title: 'Spending summary',
    description: 'Answer spending questions from the money journal: totals by category for a date range (defaults to this month so far), optionally one category.',
    access: 'read',
    input: {
      from: dateArg.describe('First date, YYYY-MM-DD. Defaults to the start of this month.'),
      to: dateArg.describe('Last date, YYYY-MM-DD. Defaults to today.'),
      category: z.string().trim().toLowerCase().max(40).optional(),
    },
    run: (state, a, ctx) => {
      const from = a.from ?? periodRange(ctx.today, 'monthly', state.settings.weekStartsOn).start
      const to = a.to ?? ctx.today
      const c = state.settings.currency
      const items = state.logs.flatMap((l) =>
        l.kind === 'money' && l.date >= from && l.date <= to && (!a.category || l.money.category === a.category) ? [l.money] : [],
      )
      const spent = items.filter((m) => m.amount < 0)
      const income = items.filter((m) => m.amount > 0).reduce((s, m) => s + m.amount, 0)
      const total = spent.reduce((s, m) => s - m.amount, 0)
      const byCat = new Map<string, { total: number; n: number }>()
      for (const m of spent) {
        const prev = byCat.get(m.category) ?? { total: 0, n: 0 }
        byCat.set(m.category, { total: prev.total - m.amount, n: prev.n + 1 })
      }
      const lines = [
        `Spending ${from} to ${to}${a.category ? ` (${a.category})` : ''}: Spent ${money(total, c)}, received ${money(income, c)}, net ${money(income - total, c)}.`,
        ...[...byCat.entries()].sort((x, y) => y[1].total - x[1].total).map(([cat, v]) => `- ${cat}: ${money(v.total, c)} (${v.n} entr${v.n === 1 ? 'y' : 'ies'})`),
      ]
      return { text: items.length ? lines.join('\n') : `No money entries ${from} to ${to}${a.category ? ` for ${a.category}` : ''}.` }
    },
  }),
  defineTool({
    name: 'pre_trade_check',
    title: 'Pre-trade check',
    description:
      'Before the user places a trade: checks today against their own trading rules (daily loss limits written in a rule, rules already broken today), lists their rules, today’s trades and P&L, and unfinished trading prep. Based only on their own data; not financial advice.',
    access: 'read',
    input: { area: z.string().trim().max(200).optional().describe('Trading area id or name. Defaults to the area named like "Trading".') },
    run: (state, a, ctx) => {
      const area = a.area
        ? findArea(state, a.area)
        : state.areas.find((x) => !x.archived && /trad/i.test(x.name))
      if (!area) throw new ToolError('No trading area found. Pass the area name, or add one with add_area.')
      const c = state.settings.currency
      const trades = state.logs.flatMap((l) => (l.kind === 'trade' && l.date === ctx.today ? [l.trade] : []))
      const losses = trades.filter((t) => t.pnl < 0).length
      const pnl = trades.reduce((s, t) => s + t.pnl, 0)
      const rules = state.rules.filter((r) => !r.archived && r.areaId === area.id)
      const checks = state.ruleChecks[ctx.today] ?? {}
      const done = new Set(state.completions[ctx.today] ?? [])
      const prepLeft = scheduledRoutines(state, ctx.today, area.id).filter((r) => !done.has(r.id))

      const stops: string[] = []
      for (const r of rules) {
        if (checks[r.id] === false) stops.push(`STOP: you marked ${quote(r.text)} as broken today.`)
        const limit = r.text.match(/(\d+)\s+loss(es)?/i)
        if (limit && losses >= Number(limit[1])) stops.push(`STOP: your rule ${quote(r.text)}, and you have ${losses} losses today.`)
      }
      const lines = [
        ...(stops.length ? stops : ['No rule says stop based on what is logged today.']),
        `Trades today: ${trades.length}, losses ${losses}, P&L ${money(pnl, c)}.`,
        ...(prepLeft.length ? [`Not done yet: ${prepLeft.map((r) => r.title).join(', ')}.`] : []),
        '',
        `Your ${area.name} rules:`,
        ...(rules.length
          ? rules.map((r) => `- ${r.text}${checks[r.id] === true ? ' (kept today)' : checks[r.id] === false ? ' (BROKEN today)' : ''}`)
          : ['- none written yet']),
        '',
        'Based only on your own rules and journal. Not financial advice.',
      ]
      return { text: lines.join('\n') }
    },
  }),
]

export const coachTools = [...memoryTools, ...reviewTools]
