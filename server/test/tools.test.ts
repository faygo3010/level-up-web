import { starterState } from '../../app/src/core/defaults'
import type { AppState } from '../../app/src/core/types'
import { TOOLS, ToolError, type ToolContext, type ToolResult } from '../src/tools'

const TODAY = '2026-11-24' // Tuesday
let ids = 0
const ctx: ToolContext = { today: TODAY, now: 1_700_000_000_000, newId: () => `id-${++ids}`, source: 'Test Chat' }

function call(name: string, args: Record<string, unknown>, state: AppState = starterState(TODAY)): ToolResult {
  const tool = TOOLS.find((t) => t.name === name)
  if (!tool) throw new Error(`no tool ${name}`)
  const parsed = tool.schema.parse(args)
  return tool.run(state, parsed, ctx)
}

/** Run a write tool and return the resulting state, failing if nothing changed. */
function write(name: string, args: Record<string, unknown>, state?: AppState): AppState {
  const r = call(name, args, state)
  if (!r.state) throw new Error(`${name} changed nothing: ${r.text}`)
  return r.state
}

describe('tool catalogue', () => {
  it('has unique snake_case names, descriptions, and marks destructive tools', () => {
    const names = TOOLS.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^[a-z_]+$/)
      expect(t.description.length).toBeGreaterThan(20)
    }
    expect(TOOLS.filter((t) => t.destructive).map((t) => t.name).sort()).toEqual([
      'archive_area',
      'archive_goal',
      'archive_routine',
      'archive_rule',
      'delete_journal_entry',
      'forget',
    ])
    expect(TOOLS.filter((t) => t.access === 'read').every((t) => !t.destructive)).toBe(true)
  })
})

describe('read tools', () => {
  it('get_today lists the schedule with ids, rules and goal progress', () => {
    const { text, state } = call('get_today', {})
    expect(state).toBeUndefined()
    expect(text).toContain('Tue 24 Nov')
    expect(text).toContain('Plan top 3 priorities')
    expect(text).toMatch(/\[ \] Train .*id: fit-train/)
    expect(text).toContain('Max 1% account risk per trade')
    expect(text).toContain('Training sessions: 0 / 4 sessions')
  })

  it('get_today reflects completions and rule checks', () => {
    const s = write('complete_routine', { routine: 'train' })
    const s2 = write('check_rule', { rule: 'stop loss', kept: false }, s)
    const { text } = call('get_today', {}, s2)
    expect(text).toMatch(/\[x\] Train/)
    expect(text).toMatch(/BROKEN.*Stop loss set before entry/)
  })

  it('get_today can look at another date', () => {
    expect(call('get_today', { date: '2026-11-28' }).text).not.toContain('Plan top 3 priorities')
  })

  it('get_system describes areas, routines, rules and goals with ids', () => {
    const { text } = call('get_system', { area: 'trading' })
    expect(text).toContain('Trading (id: trading)')
    expect(text).toContain('Pre-market prep & levels')
    expect(text).toContain('Weekdays')
    expect(text).not.toContain('Fitness')
  })

  it('get_journal filters by kind and shows details', () => {
    const s = write('add_journal_entry', { kind: 'trade', symbol: 'nq', side: 'short', pnl: 220, followed_plan: true })
    const s2 = write('add_journal_entry', { kind: 'note', text: 'Felt sharp' }, s)
    const trades = call('get_journal', { kind: 'trade' }, s2).text
    expect(trades).toContain('NQ short')
    expect(trades).not.toContain('Felt sharp')
  })

  it('get_insights summarises streaks, adherence and trading', () => {
    const s = write('add_journal_entry', { kind: 'trade', symbol: 'ES', pnl: -100, followed_plan: false })
    const { text } = call('get_insights', {}, s)
    expect(text).toMatch(/Current streak: 0 days/)
    expect(text).toContain('Trading this month: 1 trades')
    expect(text).toContain('Off-plan trades: 1')
  })
})

describe('daily tracking tools', () => {
  it('complete_routine matches by id or name and can undo', () => {
    const s = write('complete_routine', { routine: 'fit-train' })
    expect(s.completions[TODAY]).toEqual(['fit-train'])
    const undone = write('complete_routine', { routine: 'Train', done: false }, s)
    expect(undone.completions[TODAY]).toEqual([])
  })

  it('complete_routine is idempotent', () => {
    const s = write('complete_routine', { routine: 'train' })
    const again = call('complete_routine', { routine: 'train' }, s)
    expect(again.state).toBeUndefined()
    expect(again.text).toMatch(/already/i)
  })

  it('reports ambiguous and unknown names with the options', () => {
    expect(() => call('complete_routine', { routine: 'p' })).toThrow(ToolError)
    expect(() => call('complete_routine', { routine: 'p' })).toThrow(/matches several.*Plan top 3 priorities/)
    expect(() => call('complete_routine', { routine: 'zzz' })).toThrow(/No routine matches "zzz"/)
  })

  it('check_rule records kept or broken', () => {
    const s = write('check_rule', { rule: 'trade-risk', kept: true })
    expect(s.ruleChecks[TODAY]).toEqual({ 'trade-risk': true })
  })

  it('log_goal_progress adds to the goal and reports progress', () => {
    const r = call('log_goal_progress', { goal: 'training', amount: 2 })
    expect(r.state?.goalEntries).toEqual([{ id: 'id-' + ids, goalId: 'g-train', date: TODAY, value: 2 }])
    expect(r.text).toContain('2 / 4 sessions')
  })

  it('rejects future dates and bad dates', () => {
    expect(() => call('complete_routine', { routine: 'train', date: '2026-12-01' })).toThrow(/future/)
    expect(() => call('complete_routine', { routine: 'train', date: '24/11/2026' })).toThrow()
  })
})

describe('journal tools', () => {
  it('adds a trade to the trading area by default', () => {
    const s = write('add_journal_entry', { kind: 'trade', symbol: 'aapl', pnl: 50, followed_plan: true, text: 'Clean breakout' })
    expect(s.logs[0]).toMatchObject({
      kind: 'trade',
      areaId: 'trading',
      date: TODAY,
      text: 'Clean breakout',
      trade: { symbol: 'AAPL', side: 'long', pnl: 50, followedPlan: true },
    })
  })

  it('records spending as negative and income as positive', () => {
    const spent = write('add_journal_entry', { kind: 'money', amount: 12.5, category: 'Food' })
    expect(spent.logs[0]).toMatchObject({ areaId: 'finance', money: { amount: -12.5, category: 'food' } })
    const earned = write('add_journal_entry', { kind: 'money', amount: 2000, income: true, category: 'salary' })
    expect(earned.logs[0]).toMatchObject({ money: { amount: 2000 } })
  })

  it('adds workouts and validates required fields', () => {
    const s = write('add_journal_entry', { kind: 'workout', activity: 'Run', minutes: 35 })
    expect(s.logs[0]).toMatchObject({ areaId: 'fitness', workout: { activity: 'Run', minutes: 35 } })
    expect(() => call('add_journal_entry', { kind: 'trade' })).toThrow(/pnl/)
    expect(() => call('add_journal_entry', { kind: 'workout' })).toThrow(/minutes/)
    expect(() => call('add_journal_entry', { kind: 'money' })).toThrow(/amount/)
    expect(() => call('add_journal_entry', { kind: 'note' })).toThrow(/text/)
  })

  it('deletes a journal entry by id', () => {
    const s = write('add_journal_entry', { kind: 'note', text: 'x' })
    const id = s.logs[0]!.id
    expect(write('delete_journal_entry', { id }, s).logs).toHaveLength(0)
    expect(() => call('delete_journal_entry', { id: 'nope' }, s)).toThrow(/No journal entry/)
  })
})

describe('system editing tools', () => {
  it('adds a routine with a schedule preset', () => {
    const s = write('add_routine', { area: 'fitness', title: 'Stretch', days: 'weekends', time_of_day: 'evening' })
    expect(s.routines.at(-1)).toMatchObject({ areaId: 'fitness', title: 'Stretch', days: [0, 6], timeOfDay: 'evening' })
  })

  it('accepts explicit days', () => {
    const s = write('add_routine', { area: 'work', title: 'Review week', days: ['fri'] })
    expect(s.routines.at(-1)?.days).toEqual([5])
  })

  it('updates and archives routines', () => {
    const s = write('update_routine', { routine: 'train', title: 'Lift', days: 'daily' })
    expect(s.routines.find((r) => r.id === 'fit-train')).toMatchObject({ title: 'Lift', days: [0, 1, 2, 3, 4, 5, 6] })
    const a = write('archive_routine', { routine: 'lift' }, s)
    expect(a.routines.find((r) => r.id === 'fit-train')?.archived).toBe(true)
    expect(() => call('complete_routine', { routine: 'lift' }, a)).toThrow(/No routine/)
  })

  it('adds, updates and archives rules', () => {
    const s = write('add_rule', { area: 'trading', text: 'No trades before 10am' })
    expect(s.rules.at(-1)?.text).toBe('No trades before 10am')
    const u = write('update_rule', { rule: 'before 10am', text: 'No trades before 9:45' }, s)
    expect(u.rules.at(-1)?.text).toBe('No trades before 9:45')
    expect(write('archive_rule', { rule: '9:45' }, u).rules.at(-1)?.archived).toBe(true)
  })

  it('adds and updates goals', () => {
    const s = write('add_goal', { area: 'fitness', title: 'Runs', target: 3, unit: 'runs', period: 'weekly' })
    expect(s.goals.at(-1)).toMatchObject({ title: 'Runs', target: 3, direction: 'atLeast' })
    const u = write('update_goal', { goal: 'training sessions', target: 5 }, s)
    expect(u.goals.find((g) => g.id === 'g-train')?.target).toBe(5)
    expect(() => call('add_goal', { area: 'fitness', title: 'x', target: 0 })).toThrow()
    expect(write('archive_goal', { goal: 'runs' }, u).goals.at(-1)?.archived).toBe(true)
  })

  it('adds, renames and archives areas, cascading the archive', () => {
    const s = write('add_area', { name: 'Health', icon: '❤️' })
    expect(s.areas.at(-1)).toMatchObject({ name: 'Health', icon: '❤️', archived: false })
    expect(() => call('add_area', { name: 'health' }, s)).toThrow(/already exists/)
    const r = write('update_area', { area: 'health', name: 'Health & sleep' }, s)
    expect(r.areas.at(-1)?.name).toBe('Health & sleep')
    const a = write('archive_area', { area: 'trading' }, r)
    expect(a.routines.filter((x) => x.areaId === 'trading').every((x) => x.archived)).toBe(true)
  })

  it('updates settings', () => {
    const s = write('update_settings', { currency: '$', week_starts_on: 'sunday', streak_threshold: 0.7 })
    expect(s.settings).toMatchObject({ currency: '$', weekStartsOn: 0, streakThreshold: 0.7 })
    expect(() => call('update_settings', { time_zone: 'Mars/Base' })).toThrow(/time zone/)
  })

  it('every write records a short summary for the activity log', () => {
    expect(call('complete_routine', { routine: 'train' }).summary).toBe('Ticked off "Train" for 2026-11-24')
    expect(call('add_rule', { area: 'work', text: 'Inbox zero by 5' }).summary).toBe('Added rule "Inbox zero by 5" to Work')
  })
})

describe('coach memory (awesome-ai-apps memory agents pattern)', () => {
  it('remembers, recalls with a search, and forgets', () => {
    const s = write('remember', { text: 'Overtrades after a losing morning', area: 'trading' })
    expect(s.memories[0]).toMatchObject({ text: 'Overtrades after a losing morning', areaId: 'trading', source: 'Test Chat' })
    const s2 = write('remember', { text: 'Prefers to train before work' }, s)
    expect(call('recall', {}, s2).text).toMatch(/Prefers to train before work[\s\S]*Overtrades/)
    const found = call('recall', { query: 'overtrade' }, s2).text
    expect(found).toContain('Overtrades')
    expect(found).not.toContain('Prefers')
    const id = s2.memories[1]!.id
    expect(write('forget', { id }, s2).memories).toHaveLength(1)
    expect(() => call('forget', { id: 'nope' }, s2)).toThrow(/No memory/)
  })

  it('says so when there is nothing remembered yet', () => {
    expect(call('recall', {}).text).toMatch(/Nothing saved yet/)
  })
})

describe('get_weekly_review (study coach reflection pattern)', () => {
  it('summarises the week: adherence, broken rules, missed routines, trading, budgets', () => {
    let s = write('check_rule', { rule: 'stop loss', kept: false })
    s = write('check_rule', { rule: 'stop loss', kept: false, date: '2026-11-23' }, s)
    s = write('add_journal_entry', { kind: 'trade', symbol: 'ES', pnl: -50, followed_plan: false }, s)
    s = write('log_goal_progress', { goal: 'discretionary', amount: 300 }, s)
    const { text } = call('get_weekly_review', {}, s)
    expect(text).toContain('Week 2026-11-18 to 2026-11-24')
    expect(text).toMatch(/Most broken rules:\n- Stop loss set before entry: broken 2 times/)
    expect(text).toMatch(/Most missed routines:/)
    expect(text).toContain('Off-plan trades: 1')
    expect(text).toMatch(/Discretionary spending: .*£300/)
    expect(text).toMatch(/Questions to reflect on/)
  })
})

describe('get_spending (expense tracker pattern)', () => {
  it('answers spending questions by category and period', () => {
    let s = write('add_journal_entry', { kind: 'money', amount: 12, category: 'food' })
    s = write('add_journal_entry', { kind: 'money', amount: 30, category: 'food', date: '2026-11-02' }, s)
    s = write('add_journal_entry', { kind: 'money', amount: 50, category: 'fuel' }, s)
    s = write('add_journal_entry', { kind: 'money', amount: 999, category: 'food', date: '2026-10-30' }, s)
    expect(call('get_spending', { category: 'food' }, s).text).toMatch(/food: £42 \(2 entries\)/)
    const all = call('get_spending', {}, s).text
    expect(all).toContain('2026-11-01 to 2026-11-24')
    expect(all).toMatch(/Spent £92/)
    expect(call('get_spending', { from: '2026-10-01', to: '2026-10-31' }, s).text).toMatch(/Spent £999/)
  })
})

describe('pre_trade_check (pre-trade brief pattern, grounded in the user’s own rules)', () => {
  it('clears the user when nothing is broken', () => {
    const { text } = call('pre_trade_check', {})
    expect(text).toMatch(/No rule says stop/)
    expect(text).toContain('Max 1% account risk per trade')
    expect(text).toContain('Not financial advice')
  })

  it('flags the daily loss limit from the rule text', () => {
    let s = write('add_journal_entry', { kind: 'trade', symbol: 'ES', pnl: -40, followed_plan: true })
    s = write('add_journal_entry', { kind: 'trade', symbol: 'NQ', pnl: -60, followed_plan: true }, s)
    const { text } = call('pre_trade_check', {}, s)
    expect(text).toMatch(/STOP: .*2 losses today/)
    expect(text).toContain('Trades today: 2, losses 2, P&L -£100')
  })

  it('flags a rule already broken today and unfinished prep', () => {
    const s = write('check_rule', { rule: 'stop loss', kept: false })
    const { text } = call('pre_trade_check', {}, s)
    expect(text).toMatch(/STOP: you marked "Stop loss set before entry" as broken today/)
    expect(text).toMatch(/Not done yet: Pre-market prep & levels/)
  })
})
