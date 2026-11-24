import { z } from 'zod'
import { reducer } from '../../../app/src/core/reducer'
import type { LogEntry } from '../../../app/src/core/types'
import { goalLine, logLine } from './read'
import {
  dateArg,
  defaultAreaFor,
  defineTool,
  findArea,
  findOne,
  nameArg,
  quote,
  resolveDate,
  ToolError,
} from './shared'

const required = <T>(value: T | undefined, field: string, kind: string): T => {
  if (value === undefined) throw new ToolError(`A ${kind} entry needs "${field}".`)
  return value
}

const ENTRY_AREA_HINT = { trade: 'trad', workout: 'fit', money: 'fin', note: '' } as const

export const trackTools = [
  defineTool({
    name: 'complete_routine',
    title: 'Tick off a routine',
    description: 'Mark one of the user’s routines as done (or not done) for a day. Use when the user says they did something in their system.',
    access: 'write',
    input: {
      routine: nameArg('routine'),
      done: z.boolean().default(true).describe('false to un-tick it.'),
      date: dateArg,
    },
    run: (state, { routine, done, date }, ctx) => {
      const r = findOne(state.routines, routine, (x) => x.title, 'routine')
      const day = resolveDate(date, ctx)
      const isDone = (state.completions[day] ?? []).includes(r.id)
      if (isDone === done) return { text: `${quote(r.title)} was already ${done ? 'done' : 'not done'} for ${day}. Nothing changed.` }
      return {
        state: reducer(state, { type: 'toggleRoutine', date: day, routineId: r.id }),
        text: `${done ? 'Ticked off' : 'Un-ticked'} ${quote(r.title)} for ${day}.`,
        summary: `${done ? 'Ticked off' : 'Un-ticked'} ${quote(r.title)} for ${day}`,
      }
    },
  }),
  defineTool({
    name: 'check_rule',
    title: 'Review a playbook rule',
    description: 'Record whether the user kept or broke one of their playbook rules on a day (e.g. trading risk rules). Pass kept: null to clear it.',
    access: 'write',
    input: { rule: nameArg('rule'), kept: z.boolean().nullable(), date: dateArg },
    run: (state, { rule, kept, date }, ctx) => {
      const r = findOne(state.rules, rule, (x) => x.text, 'rule')
      const day = resolveDate(date, ctx)
      const word = kept === null ? 'Cleared' : kept ? 'Kept' : 'Broke'
      return {
        state: reducer(state, { type: 'setRuleCheck', date: day, ruleId: r.id, kept }),
        text: `${word}: ${quote(r.text)} on ${day}.`,
        summary: `Marked rule ${quote(r.text)} as ${kept === null ? 'not reviewed' : kept ? 'kept' : 'broken'} for ${day}`,
      }
    },
  }),
  defineTool({
    name: 'log_goal_progress',
    title: 'Log goal progress',
    description:
      'Add an amount to one of the user’s goals for a day, e.g. 1 training session, 2.5 deep work hours, or £40 of discretionary spending. Use a negative amount to correct a mistake.',
    access: 'write',
    input: { goal: nameArg('goal'), amount: z.number().finite().refine((n) => n !== 0, 'Amount cannot be 0'), date: dateArg },
    run: (state, { goal, amount, date }, ctx) => {
      const g = findOne(state.goals, goal, (x) => x.title, 'goal')
      const day = resolveDate(date, ctx)
      const next = reducer(state, { type: 'addGoalEntry', entry: { id: ctx.newId(), goalId: g.id, date: day, value: amount } })
      return {
        state: next,
        text: `Logged ${amount} on ${quote(g.title)}. Now: ${goalLine(next, g, day)}`,
        summary: `Logged ${amount} ${g.unit} on goal ${quote(g.title)}`.replace(/\s+/g, ' '),
      }
    },
  }),
  defineTool({
    name: 'add_journal_entry',
    title: 'Add a journal entry',
    description:
      'Log a trade, workout, money movement or note. trade needs pnl (negative for a loss) and followed_plan; workout needs minutes; money needs amount (spending by default, set income: true for money received); note needs text.',
    access: 'write',
    input: {
      kind: z.enum(['trade', 'workout', 'money', 'note']),
      text: z.string().trim().max(2000).optional().describe('Notes. Required for kind "note".'),
      area: z.string().trim().max(200).optional().describe('Area id or name. Defaults to the matching area (Trading, Fitness, Finance).'),
      date: dateArg,
      symbol: z.string().trim().max(20).optional(),
      side: z.enum(['long', 'short']).optional(),
      pnl: z.number().finite().optional().describe('Profit or loss in the user’s currency; negative for a loss.'),
      followed_plan: z.boolean().optional().describe('Did the trade follow the user’s plan and rules?'),
      activity: z.string().trim().max(60).optional(),
      minutes: z.number().finite().min(0).max(24 * 60).optional(),
      amount: z.number().finite().positive().optional().describe('Money amount, always positive.'),
      income: z.boolean().optional().describe('true if money was received rather than spent.'),
      category: z.string().trim().max(40).optional(),
    },
    run: (state, a, ctx) => {
      const area = a.area ? findArea(state, a.area) : defaultAreaFor(state, ENTRY_AREA_HINT[a.kind])
      const base = { id: ctx.newId(), areaId: area.id, date: resolveDate(a.date, ctx), text: a.text ?? '', createdAt: ctx.now }
      const entry: LogEntry = (() => {
        switch (a.kind) {
          case 'note':
            if (!a.text) throw new ToolError('A note entry needs "text".')
            return { ...base, kind: 'note' }
          case 'trade':
            return {
              ...base,
              kind: 'trade',
              trade: {
                symbol: (a.symbol ?? '').toUpperCase(),
                side: a.side ?? 'long',
                pnl: required(a.pnl, 'pnl', 'trade'),
                followedPlan: a.followed_plan ?? true,
              },
            }
          case 'workout':
            return { ...base, kind: 'workout', workout: { activity: a.activity || 'Workout', minutes: required(a.minutes, 'minutes', 'workout') } }
          case 'money': {
            const amount = required(a.amount, 'amount', 'money')
            return { ...base, kind: 'money', money: { amount: a.income ? amount : -amount, category: (a.category || 'other').toLowerCase() } }
          }
        }
      })()
      const next = reducer(state, { type: 'addLog', entry })
      const line = logLine(next, entry).replace(/^- /, '')
      return { state: next, text: `Saved: ${line}`, summary: `Added journal entry: ${line.replace(/ \(id: .*\)$/, '')}` }
    },
  }),
  defineTool({
    name: 'delete_journal_entry',
    title: 'Delete a journal entry',
    description: 'Permanently delete one journal entry by its id (get ids from get_journal). Confirm with the user first.',
    access: 'write',
    destructive: true,
    input: { id: z.string().trim().min(1).max(100) },
    run: (state, { id }) => {
      const entry = state.logs.find((l) => l.id === id)
      if (!entry) throw new ToolError(`No journal entry has id ${id}. Use get_journal to find it.`)
      const line = logLine(state, entry).replace(/^- /, '').replace(/ \(id: .*\)$/, '')
      return { state: reducer(state, { type: 'removeLog', id }), text: `Deleted: ${line}`, summary: `Deleted journal entry: ${line}` }
    },
  }),
]
