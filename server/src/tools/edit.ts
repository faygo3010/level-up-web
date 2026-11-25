import { z } from 'zod'
import { AREA_COLORS } from '../../../app/src/core/defaults'
import { describeDays, withUnit } from '../../../app/src/core/format'
import { reducer } from '../../../app/src/core/reducer'
import type { Goal } from '../../../app/src/core/types'
import {
  areaName,
  daysArg,
  defineTool,
  findArea,
  findOne,
  nameArg,
  quote,
  shortText,
  timeOfDayArg,
  toWeekdays,
  ToolError,
  amountArg,
  iconArg,
} from './shared'

const areaArg = z.string().trim().min(1).max(200).describe('The area id or name, e.g. "Trading".')
const PER: Record<Goal['period'], string> = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }

const routineTools = [
  defineTool({
    name: 'add_routine',
    title: 'Add a routine',
    description: 'Add a repeatable action to the user’s system in one area, with the days it should happen and the time of day.',
    access: 'write',
    input: {
      area: areaArg,
      title: shortText(),
      days: daysArg.default('daily'),
      time_of_day: timeOfDayArg.default('anytime'),
    },
    run: (state, a, ctx) => {
      const area = findArea(state, a.area, 'exact')
      const item = { id: ctx.newId(), areaId: area.id, title: a.title, days: toWeekdays(a.days), timeOfDay: a.time_of_day, archived: false }
      return {
        state: reducer(state, { type: 'upsert', collection: 'routines', item }),
        text: `Added routine ${quote(item.title)} to ${area.name}: ${describeDays(item.days)}, ${item.timeOfDay} (id: ${item.id}).`,
        summary: `Added routine ${quote(item.title)} to ${area.name}`,
      }
    },
  }),
  defineTool({
    name: 'update_routine',
    title: 'Edit a routine',
    description: 'Rename a routine, change its days or time of day, or move it to another area. Only the fields given change.',
    access: 'write',
    idempotent: true,
    input: {
      routine: nameArg('routine'),
      title: shortText().optional(),
      days: daysArg.optional(),
      time_of_day: timeOfDayArg.optional(),
      area: areaArg.optional(),
    },
    run: (state, a) => {
      const r = findOne(state.routines, a.routine, (x) => x.title, 'routine', 'exact')
      const item = {
        ...r,
        ...(a.title && { title: a.title }),
        ...(a.days && { days: toWeekdays(a.days) }),
        ...(a.time_of_day && { timeOfDay: a.time_of_day }),
        ...(a.area && { areaId: findArea(state, a.area, 'exact').id }),
      }
      return {
        state: reducer(state, { type: 'upsert', collection: 'routines', item }),
        text: `Updated routine: ${item.title}, ${describeDays(item.days)}, ${item.timeOfDay}, in ${areaName(state, item.areaId)}.`,
        summary: `Edited routine ${quote(item.title)}`,
      }
    },
  }),
  defineTool({
    name: 'archive_routine',
    title: 'Archive a routine',
    description: 'Remove a routine from the user’s schedule. Its history is kept. Confirm with the user first.',
    access: 'write',
    destructive: true,
    input: { routine: nameArg('routine') },
    run: (state, a) => {
      const r = findOne(state.routines, a.routine, (x) => x.title, 'routine', 'exact')
      return {
        state: reducer(state, { type: 'archive', collection: 'routines', id: r.id }),
        text: `Archived routine ${quote(r.title)}.`,
        summary: `Archived routine ${quote(r.title)}`,
      }
    },
  }),
]

const ruleTools = [
  defineTool({
    name: 'add_rule',
    title: 'Add a playbook rule',
    description: 'Add a written rule to one area of the user’s playbook, e.g. "Max 1% risk per trade". Rules are reviewed daily as kept or broken.',
    access: 'write',
    input: { area: areaArg, text: shortText(300) },
    run: (state, a, ctx) => {
      const area = findArea(state, a.area, 'exact')
      const item = { id: ctx.newId(), areaId: area.id, text: a.text, archived: false }
      return {
        state: reducer(state, { type: 'upsert', collection: 'rules', item }),
        text: `Added rule to ${area.name}: ${item.text} (id: ${item.id}).`,
        summary: `Added rule ${quote(item.text)} to ${area.name}`,
      }
    },
  }),
  defineTool({
    name: 'update_rule',
    title: 'Edit a playbook rule',
    description: 'Reword a rule or move it to another area.',
    access: 'write',
    idempotent: true,
    input: { rule: nameArg('rule'), text: shortText(300).optional(), area: areaArg.optional() },
    run: (state, a) => {
      const r = findOne(state.rules, a.rule, (x) => x.text, 'rule', 'exact')
      const item = { ...r, ...(a.text && { text: a.text }), ...(a.area && { areaId: findArea(state, a.area, 'exact').id }) }
      return {
        state: reducer(state, { type: 'upsert', collection: 'rules', item }),
        text: `Updated rule: ${item.text} (${areaName(state, item.areaId)}).`,
        summary: `Edited rule ${quote(item.text)}`,
      }
    },
  }),
  defineTool({
    name: 'archive_rule',
    title: 'Archive a playbook rule',
    description: 'Remove a rule from the user’s playbook. Past reviews are kept. Confirm with the user first.',
    access: 'write',
    destructive: true,
    input: { rule: nameArg('rule') },
    run: (state, a) => {
      const r = findOne(state.rules, a.rule, (x) => x.text, 'rule', 'exact')
      return {
        state: reducer(state, { type: 'archive', collection: 'rules', id: r.id }),
        text: `Archived rule ${quote(r.text)}.`,
        summary: `Archived rule ${quote(r.text)}`,
      }
    },
  }),
]

const goalFields = {
  title: shortText(),
  target: amountArg.positive(),
  unit: z.string().trim().max(20).describe('e.g. "sessions", "hours", "£".'),
  period: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  direction: z.enum(['atLeast', 'atMost']).describe('atLeast = reach the target; atMost = a budget to stay under.'),
}

const goalTools = [
  defineTool({
    name: 'add_goal',
    title: 'Add a goal',
    description: 'Add a measurable goal with a progress bar, e.g. 4 training sessions a week, or a budget like at most £400 a month.',
    access: 'write',
    input: {
      area: areaArg,
      ...goalFields,
      unit: goalFields.unit.default(''),
      period: goalFields.period.default('weekly'),
      direction: goalFields.direction.default('atLeast'),
    },
    run: (state, a, ctx) => {
      const area = findArea(state, a.area, 'exact')
      const item: Goal = { id: ctx.newId(), areaId: area.id, title: a.title, target: a.target, unit: a.unit, period: a.period, direction: a.direction, archived: false }
      return {
        state: reducer(state, { type: 'upsert', collection: 'goals', item }),
        text: `Added goal to ${area.name}: ${item.title}, ${item.direction === 'atMost' ? 'at most' : 'at least'} ${withUnit(item.target, item.unit)} per ${PER[item.period]} (id: ${item.id}).`,
        summary: `Added goal ${quote(item.title)} to ${area.name}`,
      }
    },
  }),
  defineTool({
    name: 'update_goal',
    title: 'Edit a goal',
    description: 'Change a goal’s name, target, unit, period or type. Only the fields given change. Past progress is kept.',
    access: 'write',
    idempotent: true,
    input: {
      goal: nameArg('goal'),
      title: goalFields.title.optional(),
      target: goalFields.target.optional(),
      unit: goalFields.unit.optional(),
      period: goalFields.period.optional(),
      direction: goalFields.direction.optional(),
    },
    run: (state, { goal, ...changes }) => {
      const g = findOne(state.goals, goal, (x) => x.title, 'goal', 'exact')
      const defined = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined))
      const item: Goal = { ...g, ...defined }
      return {
        state: reducer(state, { type: 'upsert', collection: 'goals', item }),
        text: `Updated goal: ${item.title}, ${withUnit(item.target, item.unit)} per ${PER[item.period]}.`,
        summary: `Edited goal ${quote(item.title)}`,
      }
    },
  }),
  defineTool({
    name: 'archive_goal',
    title: 'Archive a goal',
    description: 'Remove a goal from the user’s dashboard. Its history is kept. Confirm with the user first.',
    access: 'write',
    destructive: true,
    input: { goal: nameArg('goal') },
    run: (state, a) => {
      const g = findOne(state.goals, a.goal, (x) => x.title, 'goal', 'exact')
      return {
        state: reducer(state, { type: 'archive', collection: 'goals', id: g.id }),
        text: `Archived goal ${quote(g.title)}.`,
        summary: `Archived goal ${quote(g.title)}`,
      }
    },
  }),
]

const areaTools = [
  defineTool({
    name: 'add_area',
    title: 'Add a life area',
    description: 'Add a new area of the user’s life (e.g. Health, Learning, Family) to hold its own routines, rules and goals.',
    access: 'write',
    input: { name: shortText(40), icon: iconArg.default('⭐').describe('A single emoji.') },
    run: (state, a, ctx) => {
      if (state.areas.some((x) => !x.archived && x.name.toLowerCase() === a.name.toLowerCase())) {
        throw new ToolError(`An area called ${quote(a.name)} already exists.`)
      }
      const color = AREA_COLORS[state.areas.length % AREA_COLORS.length] ?? '#ffffff'
      const item = { id: ctx.newId(), name: a.name, icon: a.icon || '⭐', color, archived: false }
      return {
        state: reducer(state, { type: 'upsert', collection: 'areas', item }),
        text: `Added area ${item.icon} ${item.name} (id: ${item.id}).`,
        summary: `Added area ${quote(item.name)}`,
      }
    },
  }),
  defineTool({
    name: 'update_area',
    title: 'Rename a life area',
    description: 'Rename an area or change its emoji icon.',
    access: 'write',
    idempotent: true,
    input: { area: areaArg, name: shortText(40).optional(), icon: iconArg.optional() },
    run: (state, a) => {
      const area = findArea(state, a.area, 'exact')
      if (a.name && state.areas.some((x) => !x.archived && x.id !== area.id && x.name.toLowerCase() === a.name!.toLowerCase())) {
        throw new ToolError(`An area called ${quote(a.name)} already exists.`)
      }
      const item = { ...area, ...(a.name && { name: a.name }), ...(a.icon && { icon: a.icon }) }
      return {
        state: reducer(state, { type: 'upsert', collection: 'areas', item }),
        text: `Updated area: ${item.icon} ${item.name}.`,
        summary: `Edited area ${quote(item.name)}`,
      }
    },
  }),
  defineTool({
    name: 'archive_area',
    title: 'Archive a life area',
    description: 'Archive a whole area along with its routines, rules and goals. History is kept. Always confirm with the user first.',
    access: 'write',
    destructive: true,
    input: { area: areaArg },
    run: (state, a) => {
      const area = findArea(state, a.area, 'exact')
      return {
        state: reducer(state, { type: 'archive', collection: 'areas', id: area.id }),
        text: `Archived area ${quote(area.name)} and everything in it.`,
        summary: `Archived area ${quote(area.name)}`,
      }
    },
  }),
]

/** The canonical IANA name ("pacific/auckland" -> "Pacific/Auckland"), or null if unknown. */
function canonicalTimeZone(tz: string): string | null {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz }).resolvedOptions().timeZone
  } catch {
    return null
  }
}

const settingsTools = [
  defineTool({
    name: 'update_settings',
    title: 'Change settings',
    description: 'Change the user’s currency symbol, first day of the week, streak threshold (0.5–1) or time zone (IANA, e.g. "Europe/London").',
    access: 'write',
    idempotent: true,
    input: {
      currency: z.string().trim().min(1).max(4).optional(),
      week_starts_on: z.enum(['monday', 'sunday']).optional(),
      streak_threshold: z.number().min(0.5).max(1).optional(),
      time_zone: z.string().trim().max(64).optional(),
    },
    run: (state, a) => {
      const zone = a.time_zone ? canonicalTimeZone(a.time_zone) : undefined
      if (a.time_zone && !zone) throw new ToolError(`${quote(a.time_zone)} is not a known time zone. Use a name like "Europe/London".`)
      const settings = {
        ...(a.currency && { currency: a.currency }),
        ...(a.week_starts_on && { weekStartsOn: a.week_starts_on === 'sunday' ? (0 as const) : (1 as const) }),
        ...(a.streak_threshold !== undefined && { streakThreshold: a.streak_threshold }),
        ...(zone && { timeZone: zone }),
      }
      if (Object.keys(settings).length === 0) return { text: 'No settings given. Nothing changed.' }
      const next = reducer(state, { type: 'updateSettings', settings })
      const changed = Object.entries(settings).map(([k, v]) => `${k} = ${String(v)}`).join(', ')
      return { state: next, text: `Settings updated: ${changed}.`, summary: `Changed settings: ${changed}` }
    },
  }),
]

export const editTools = [...routineTools, ...ruleTools, ...goalTools, ...areaTools, ...settingsTools]
