import { currentStreak, dayScore, scheduledRoutines } from '../../core/adherence'
import { formatDay } from '../../core/dates'
import type { Routine, TimeOfDay } from '../../core/types'
import { GoalRow } from '../components/GoalRow'
import { RuleCheck } from '../components/RuleCheck'
import { Dot, Empty, ProgressBar, Section } from '../components/ui'
import { useAreas, useStore } from '../store'

const SLOTS: { key: TimeOfDay; label: string }[] = [
  { key: 'morning', label: 'Morning' },
  { key: 'anytime', label: 'During the day' },
  { key: 'evening', label: 'Evening' },
]

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning.'
  if (hour < 18) return 'Good afternoon.'
  return 'Good evening.'
}

/** Plain, honest summary. No exclamation marks. */
export function summaryLine(done: number, total: number, streak: number): string {
  if (total === 0) return 'Nothing scheduled today. Rest is part of the system.'
  const left = total - done
  const base = left === 0 ? `All ${total} done.` : `${done} of ${total} done. ${left} left.`
  return streak > 0 ? `${base} Streak: ${streak} day${streak === 1 ? '' : 's'}.` : base
}

function RoutineItem({ routine, done }: { routine: Routine; done: boolean }) {
  const { dispatch, today } = useStore()
  const { byId } = useAreas()
  const area = byId.get(routine.areaId)
  return (
    <li>
      <label className={`check ${done ? 'done' : ''}`}>
        <input
          type="checkbox"
          checked={done}
          onChange={() => dispatch({ type: 'toggleRoutine', date: today, routineId: routine.id })}
        />
        <span className="box" aria-hidden />
        <span className="check-title">{routine.title}</span>
        {area && (
          <span className="tag">
            <Dot color={area.color} />
            {area.name}
          </span>
        )}
      </label>
    </li>
  )
}

export function Today() {
  const { state, today } = useStore()
  const { byId } = useAreas()
  const score = dayScore(state, today)
  const streak = currentStreak(state, today)
  const routines = scheduledRoutines(state, today)
  const completed = new Set(state.completions[today] ?? [])
  const rules = state.rules.filter((r) => !r.archived)
  const goals = state.goals.filter((g) => !g.archived)

  return (
    <div className="screen">
      <header className="hero-head">
        <p className="eyebrow">{formatDay(today)}</p>
        <h1>{greeting(new Date().getHours())}</h1>
        <p className="sub">{summaryLine(score.done, score.total, streak)}</p>
        <ProgressBar ratio={score.score ?? 0} />
      </header>

      {routines.length === 0 && rules.length === 0 && goals.length === 0 && (
        <Empty>Your system is empty. Add routines, rules and goals in Areas.</Empty>
      )}

      {SLOTS.map(({ key, label }) => {
        const items = routines.filter((r) => r.timeOfDay === key)
        if (items.length === 0) return null
        return (
          <Section key={key} title={label}>
            <ul className="checklist">
              {items.map((r) => (
                <RoutineItem key={r.id} routine={r} done={completed.has(r.id)} />
              ))}
            </ul>
          </Section>
        )
      })}

      {rules.length > 0 && (
        <Section title="Rules check">
          {rules.map((r) => (
            <RuleCheck key={r.id} rule={r} color={byId.get(r.areaId)?.color ?? '#fff'} />
          ))}
        </Section>
      )}

      {goals.length > 0 && (
        <Section title="Goals">
          {goals.map((g) => (
            <GoalRow key={g.id} goal={g} color={byId.get(g.areaId)?.color ?? '#fff'} />
          ))}
        </Section>
      )}
    </div>
  )
}
