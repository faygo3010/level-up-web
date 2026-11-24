import { useState, type FormEvent } from 'react'
import { goalProgress, type GoalProgress } from '../../core/progress'
import { newId } from '../../core/ids'
import type { Goal } from '../../core/types'
import { useStore } from '../store'
import { ProgressBar } from './ui'

const PERIOD_LABEL: Record<Goal['period'], string> = {
  daily: 'today',
  weekly: 'this week',
  monthly: 'this month',
  yearly: 'this year',
}

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1))

export function describeProgress(goal: Goal, p: GoalProgress): string {
  const period = PERIOD_LABEL[goal.period]
  if (goal.direction === 'atMost') {
    if (p.status === 'over') return `Over by ${fmt(p.current - p.target)} ${goal.unit} ${period}.`
    return `${fmt(p.remaining)} ${goal.unit} left ${period}.`
  }
  if (p.status === 'done') return `Done ${period}.`
  return `${fmt(p.remaining)} ${goal.unit} to go ${period}.`
}

export function GoalRow({ goal, color }: { goal: Goal; color: string }) {
  const { state, dispatch, today } = useStore()
  const [value, setValue] = useState('')
  const progress = goalProgress(goal, state.goalEntries, today, state.settings.weekStartsOn)

  const log = (amount: number) => {
    if (!Number.isFinite(amount) || amount === 0) return
    dispatch({ type: 'addGoalEntry', entry: { id: newId(), goalId: goal.id, date: today, value: amount } })
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    log(Number(value))
    setValue('')
  }

  return (
    <div className="goal">
      <div className="goal-top">
        <span className="goal-title">{goal.title}</span>
        <span className="goal-num">
          {fmt(progress.current)}/{fmt(goal.target)} {goal.unit}
        </span>
      </div>
      <ProgressBar ratio={progress.ratio} color={color} status={progress.status} />
      <div className="goal-bottom">
        <span className={`goal-note ${progress.status}`}>{describeProgress(goal, progress)}</span>
        <form className="goal-log" onSubmit={onSubmit}>
          <button type="button" className="chip" onClick={() => log(1)} aria-label={`Add 1 to ${goal.title}`}>
            +1
          </button>
          <input
            inputMode="decimal"
            placeholder="amount"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label={`Log amount for ${goal.title}`}
          />
          <button type="submit" className="chip">
            Log
          </button>
        </form>
      </div>
    </div>
  )
}
