import { useState, type FormEvent, type ReactNode } from 'react'
import { AREA_COLORS } from '../../core/defaults'
import { newId } from '../../core/ids'
import type { Area, Goal, Routine, Rule, Weekday } from '../../core/types'
import { useStore } from '../store'
import { Field, Sheet } from './ui'

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const
const DAY_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0]

const clean = (s: string, max = 200): string => s.trim().slice(0, max)

interface FormShellProps {
  title: string
  onClose: () => void
  onSubmit: () => boolean
  onArchive?: () => void
  children: ReactNode
}

/** Shared sheet + submit/archive buttons. onSubmit returns false to keep the sheet open. */
function FormShell({ title, onClose, onSubmit, onArchive, children }: FormShellProps) {
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (onSubmit()) onClose()
  }
  return (
    <Sheet title={title} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {children}
        <div className="form-actions">
          {onArchive && (
            <button
              type="button"
              className="btn ghost danger"
              onClick={() => {
                onArchive()
                onClose()
              }}
            >
              Archive
            </button>
          )}
          <button type="submit" className="btn primary">
            Save
          </button>
        </div>
      </form>
    </Sheet>
  )
}

export function AreaForm({ area, onClose }: { area?: Area; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [name, setName] = useState(area?.name ?? '')
  const [icon, setIcon] = useState(area?.icon ?? '⭐')
  const [color, setColor] = useState(area?.color ?? AREA_COLORS[state.areas.length % AREA_COLORS.length] ?? '#fff')

  const save = () => {
    if (!clean(name)) return false
    const item: Area = { id: area?.id ?? newId(), name: clean(name, 40), icon: clean(icon, 4) || '⭐', color, archived: false }
    dispatch({ type: 'upsert', collection: 'areas', item })
    return true
  }

  return (
    <FormShell
      title={area ? 'Edit area' : 'New area'}
      onClose={onClose}
      onSubmit={save}
      onArchive={area && (() => dispatch({ type: 'archive', collection: 'areas', id: area.id }))}
    >
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Health, Learning…" autoFocus required />
      </Field>
      <Field label="Icon (emoji)">
        <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} />
      </Field>
      <div className="field">
        <span>Colour</span>
        <div className="swatches">
          {AREA_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`swatch ${c === color ? 'on' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Colour ${c}`}
              aria-pressed={c === color}
            />
          ))}
        </div>
      </div>
    </FormShell>
  )
}

export function RoutineForm({ areaId, routine, onClose }: { areaId: string; routine?: Routine; onClose: () => void }) {
  const { dispatch } = useStore()
  const [title, setTitle] = useState(routine?.title ?? '')
  const [days, setDays] = useState<Weekday[]>([...(routine?.days ?? [1, 2, 3, 4, 5])])
  const [timeOfDay, setTimeOfDay] = useState<Routine['timeOfDay']>(routine?.timeOfDay ?? 'morning')

  const toggleDay = (d: Weekday) => setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]))

  const save = () => {
    if (!clean(title) || days.length === 0) return false
    const item: Routine = {
      id: routine?.id ?? newId(),
      areaId,
      title: clean(title),
      days: [...days].sort(),
      timeOfDay,
      archived: false,
    }
    dispatch({ type: 'upsert', collection: 'routines', item })
    return true
  }

  return (
    <FormShell
      title={routine ? 'Edit routine' : 'New routine'}
      onClose={onClose}
      onSubmit={save}
      onArchive={routine && (() => dispatch({ type: 'archive', collection: 'routines', id: routine.id }))}
    >
      <Field label="What do you do?">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pre-market prep" autoFocus required />
      </Field>
      <div className="field">
        <span>Days</span>
        <div className="days">
          {DAY_ORDER.map((d) => (
            <button
              key={d}
              type="button"
              className={days.includes(d) ? 'on' : ''}
              aria-pressed={days.includes(d)}
              onClick={() => toggleDay(d)}
            >
              {DAY_LABELS[d]}
            </button>
          ))}
        </div>
      </div>
      <Field label="When">
        <select value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value as Routine['timeOfDay'])}>
          <option value="morning">Morning</option>
          <option value="anytime">During the day</option>
          <option value="evening">Evening</option>
        </select>
      </Field>
    </FormShell>
  )
}

export function RuleForm({ areaId, rule, onClose }: { areaId: string; rule?: Rule; onClose: () => void }) {
  const { dispatch } = useStore()
  const [text, setText] = useState(rule?.text ?? '')

  const save = () => {
    if (!clean(text)) return false
    dispatch({ type: 'upsert', collection: 'rules', item: { id: rule?.id ?? newId(), areaId, text: clean(text, 300), archived: false } })
    return true
  }

  return (
    <FormShell
      title={rule ? 'Edit rule' : 'New rule'}
      onClose={onClose}
      onSubmit={save}
      onArchive={rule && (() => dispatch({ type: 'archive', collection: 'rules', id: rule.id }))}
    >
      <Field label="Rule">
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="No trades in the first 15 minutes" rows={3} autoFocus required />
      </Field>
    </FormShell>
  )
}

export function GoalForm({ areaId, goal, onClose }: { areaId: string; goal?: Goal; onClose: () => void }) {
  const { dispatch } = useStore()
  const [title, setTitle] = useState(goal?.title ?? '')
  const [target, setTarget] = useState(String(goal?.target ?? ''))
  const [unit, setUnit] = useState(goal?.unit ?? '')
  const [period, setPeriod] = useState<Goal['period']>(goal?.period ?? 'weekly')
  const [direction, setDirection] = useState<Goal['direction']>(goal?.direction ?? 'atLeast')

  const save = () => {
    const t = Number(target)
    if (!clean(title) || !Number.isFinite(t) || t <= 0) return false
    const item: Goal = { id: goal?.id ?? newId(), areaId, title: clean(title), target: t, unit: clean(unit, 20), period, direction, archived: false }
    dispatch({ type: 'upsert', collection: 'goals', item })
    return true
  }

  return (
    <FormShell
      title={goal ? 'Edit goal' : 'New goal'}
      onClose={onClose}
      onSubmit={save}
      onArchive={goal && (() => dispatch({ type: 'archive', collection: 'goals', id: goal.id }))}
    >
      <Field label="Goal">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Training sessions" autoFocus required />
      </Field>
      <div className="row">
        <Field label="Target">
          <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="4" required />
        </Field>
        <Field label="Unit">
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="sessions" />
        </Field>
      </div>
      <div className="row">
        <Field label="Per">
          <select value={period} onChange={(e) => setPeriod(e.target.value as Goal['period'])}>
            <option value="daily">Day</option>
            <option value="weekly">Week</option>
            <option value="monthly">Month</option>
            <option value="yearly">Year</option>
          </select>
        </Field>
        <Field label="Type">
          <select value={direction} onChange={(e) => setDirection(e.target.value as Goal['direction'])}>
            <option value="atLeast">Reach at least</option>
            <option value="atMost">Stay under (budget)</option>
          </select>
        </Field>
      </div>
    </FormShell>
  )
}
