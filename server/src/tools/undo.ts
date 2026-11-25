import { z } from 'zod'
import { reducer } from '../../../app/src/core/reducer'
import type { LogEntry } from '../../../app/src/core/types'
import { logLine } from './read'
import { amountArg, dateArg, defineTool, findArea, findOne, nameArg, quote, resolveDate, ToolError } from './shared'

/** Ways to correct mistakes, so a chatbot never has to fake an undo with a negative entry. */

const goalEntryTools = [
  defineTool({
    name: 'list_goal_entries',
    title: 'List goal entries',
    description: 'Show the amounts logged against one goal (newest first) with their ids, so a mistaken entry can be deleted.',
    access: 'read',
    input: { goal: nameArg('goal'), limit: z.number().int().min(1).max(100).default(20) },
    run: (state, a) => {
      const g = findOne(state.goals, a.goal, (x) => x.title, 'goal')
      const entries = state.goalEntries.filter((e) => e.goalId === g.id).sort((x, y) => y.date.localeCompare(x.date)).slice(0, a.limit)
      return { text: entries.length ? entries.map((e) => `- ${e.date}: ${e.value} ${g.unit} (id: ${e.id})`).join('\n') : `Nothing logged on ${quote(g.title)} yet.` }
    },
  }),
  defineTool({
    name: 'delete_goal_entry',
    title: 'Delete a goal entry',
    description: 'Remove one logged amount from a goal by its id (from list_goal_entries). Use to undo a mistaken log_goal_progress.',
    access: 'write',
    destructive: true,
    input: { id: z.string().trim().min(1).max(100) },
    run: (state, { id }) => {
      const entry = state.goalEntries.find((e) => e.id === id)
      if (!entry) throw new ToolError(`No goal entry has id ${id}. Use list_goal_entries to find it.`)
      const goal = state.goals.find((g) => g.id === entry.goalId)
      const what = `${entry.value} on ${quote(goal?.title ?? 'a goal')} (${entry.date})`
      return { state: reducer(state, { type: 'removeGoalEntry', id }), text: `Deleted ${what}.`, summary: `Deleted goal entry ${what}` }
    },
  }),
]

const updateJournal = defineTool({
  name: 'update_journal_entry',
  title: 'Edit a journal entry',
  description:
    'Correct a journal entry by id (from get_journal) without deleting it: its notes, date or area, and the fields of its kind (trade: symbol, side, pnl, followed_plan; workout: activity, minutes; money: amount, income, category). Only the fields given change.',
  access: 'write',
  idempotent: true,
  input: {
    id: z.string().trim().min(1).max(100),
    text: z.string().trim().max(2000).optional(),
    date: dateArg,
    area: z.string().trim().max(200).optional(),
    symbol: z.string().trim().max(20).optional(),
    side: z.enum(['long', 'short']).optional(),
    pnl: amountArg.optional(),
    followed_plan: z.boolean().optional(),
    activity: z.string().trim().max(60).optional(),
    minutes: z.number().finite().min(0).max(24 * 60).optional(),
    amount: amountArg.positive().optional(),
    income: z.boolean().optional(),
    category: z.string().trim().max(40).optional(),
  },
  run: (state, a, ctx) => {
    const old = state.logs.find((l) => l.id === a.id)
    if (!old) throw new ToolError(`No journal entry has id ${a.id}. Use get_journal to find it.`)
    const base = {
      ...old,
      ...(a.text !== undefined && { text: a.text }),
      ...(a.date && { date: resolveDate(a.date, ctx) }),
      ...(a.area && { areaId: findArea(state, a.area, 'exact').id }),
    }
    const entry: LogEntry = (() => {
      switch (base.kind) {
        case 'trade':
          return {
            ...base,
            trade: {
              symbol: a.symbol !== undefined ? a.symbol.toUpperCase() : base.trade.symbol,
              side: a.side ?? base.trade.side,
              pnl: a.pnl ?? base.trade.pnl,
              followedPlan: a.followed_plan ?? base.trade.followedPlan,
            },
          }
        case 'workout':
          return { ...base, workout: { activity: a.activity || base.workout.activity, minutes: a.minutes ?? base.workout.minutes } }
        case 'money': {
          const size = a.amount ?? Math.abs(base.money.amount)
          const income = a.income ?? base.money.amount > 0
          return { ...base, money: { amount: income ? size : -size, category: a.category ? a.category.toLowerCase() : base.money.category } }
        }
        case 'note':
          if (!base.text) throw new ToolError('A note needs text.')
          return base
      }
    })()
    const next = reducer(state, { type: 'updateLog', entry })
    const line = logLine(next, entry).replace(/^- /, '')
    return { state: next, text: `Updated: ${line}`, summary: `Edited journal entry: ${line.replace(/ \(id: .*\)$/, '')}` }
  },
})

const KINDS = { routine: 'routines', rule: 'rules', goal: 'goals', area: 'areas' } as const

const restoreItem = defineTool({
  name: 'restore_item',
  title: 'Restore an archived item',
  description: 'Bring back an archived routine, rule, goal or area by id (get_system with include_archived lists them). Restoring an area does not restore what was inside it.',
  access: 'write',
  idempotent: true,
  input: { kind: z.enum(['routine', 'rule', 'goal', 'area']), id: z.string().trim().min(1).max(100) },
  run: (state, { kind, id }) => {
    const collection = KINDS[kind]
    const item = (state[collection] as readonly { id: string; archived: boolean }[]).find((x) => x.id === id)
    if (!item) throw new ToolError(`No ${kind} has id ${id}.`)
    if (!item.archived) return { text: `That ${kind} isn't archived. Nothing changed.` }
    const restored = { ...item, archived: false }
    const label = 'title' in restored ? String(restored.title) : 'text' in restored ? String(restored.text) : 'name' in restored ? String(restored.name) : id
    return {
      state: reducer(state, { type: 'upsert', collection, item: restored } as never),
      text: `Restored ${kind} ${quote(label)}.`,
      summary: `Restored ${kind} ${quote(label)}`,
    }
  },
})

export const undoTools = [...goalEntryTools, updateJournal, restoreItem]
