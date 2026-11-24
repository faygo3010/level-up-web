import { useState } from 'react'
import { areaAdherence } from '../../core/adherence'
import type { Area, Goal, Routine, Rule } from '../../core/types'
import { AreaForm, GoalForm, RoutineForm, RuleForm } from '../components/forms'
import { GoalRow } from '../components/GoalRow'
import { Empty, ProgressBar, Section, pct } from '../components/ui'
import { useAreas, useStore } from '../store'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export function describeDays(days: readonly number[]): string {
  if (days.length === 7) return 'Every day'
  const set = new Set(days)
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return 'Weekdays'
  if (days.length === 2 && set.has(0) && set.has(6)) return 'Weekends'
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => set.has(d)).map((d) => DAY_NAMES[d]).join(', ')
}

type Editing =
  | { kind: 'area'; area?: Area }
  | { kind: 'routine'; routine?: Routine }
  | { kind: 'rule'; rule?: Rule }
  | { kind: 'goal'; goal?: Goal }
  | null

const AddButton = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button className="chip" onClick={onClick} aria-label={label}>
    + Add
  </button>
)

function AreaDetail({ area, onBack }: { area: Area; onBack: () => void }) {
  const { state } = useStore()
  const [editing, setEditing] = useState<Editing>(null)
  const close = () => setEditing(null)
  const routines = state.routines.filter((r) => r.areaId === area.id && !r.archived)
  const rules = state.rules.filter((r) => r.areaId === area.id && !r.archived)
  const goals = state.goals.filter((g) => g.areaId === area.id && !g.archived)

  return (
    <div className="screen">
      <button className="back" onClick={onBack}>
        ‹ Areas
      </button>
      <header className="area-head">
        <h1>
          <span className="area-icon">{area.icon}</span> {area.name}
        </h1>
        <button className="chip" onClick={() => setEditing({ kind: 'area', area })}>
          Edit
        </button>
      </header>

      <Section title="Routines" action={<AddButton label="Add routine" onClick={() => setEditing({ kind: 'routine' })} />}>
        {routines.length === 0 && <Empty>No routines yet. What do you do every time?</Empty>}
        {routines.map((r) => (
          <button key={r.id} className="list-item" onClick={() => setEditing({ kind: 'routine', routine: r })}>
            <span>{r.title}</span>
            <span className="muted">{describeDays(r.days)}</span>
          </button>
        ))}
      </Section>

      <Section title="Playbook rules" action={<AddButton label="Add rule" onClick={() => setEditing({ kind: 'rule' })} />}>
        {rules.length === 0 && <Empty>No rules yet. What do you never do?</Empty>}
        {rules.map((r, i) => (
          <button key={r.id} className="list-item" onClick={() => setEditing({ kind: 'rule', rule: r })}>
            <span className="muted">{i + 1}.</span>
            <span className="grow">{r.text}</span>
          </button>
        ))}
      </Section>

      <Section title="Goals" action={<AddButton label="Add goal" onClick={() => setEditing({ kind: 'goal' })} />}>
        {goals.length === 0 && <Empty>No goals yet. What does progress look like?</Empty>}
        {goals.map((g) => (
          <div key={g.id} className="goal-wrap">
            <GoalRow goal={g} color={area.color} />
            <button className="link" onClick={() => setEditing({ kind: 'goal', goal: g })}>
              Edit goal
            </button>
          </div>
        ))}
      </Section>

      {editing?.kind === 'area' && <AreaForm area={editing.area} onClose={close} />}
      {editing?.kind === 'routine' && <RoutineForm areaId={area.id} routine={editing.routine} onClose={close} />}
      {editing?.kind === 'rule' && <RuleForm areaId={area.id} rule={editing.rule} onClose={close} />}
      {editing?.kind === 'goal' && <GoalForm areaId={area.id} goal={editing.goal} onClose={close} />}
    </div>
  )
}

export function Areas() {
  const { state, today } = useStore()
  const { active, byId } = useAreas()
  const [selected, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const area = selected ? byId.get(selected) : undefined
  if (area && !area.archived) return <AreaDetail area={area} onBack={() => setSelected(null)} />

  return (
    <div className="screen">
      <header className="hero-head">
        <h1>Areas</h1>
        <p className="sub">Each area of your life has its own routines, rules and goals.</p>
      </header>
      <div className="area-grid">
        {active.map((a) => {
          const week = areaAdherence(state, a.id, today, 7)
          const count = state.routines.filter((r) => r.areaId === a.id && !r.archived).length
          const rules = state.rules.filter((r) => r.areaId === a.id && !r.archived).length
          return (
            <button key={a.id} className="area-card" onClick={() => setSelected(a.id)} style={{ borderTopColor: a.color }}>
              <div className="area-card-top">
                <span className="area-icon">{a.icon}</span>
                <span className="area-pct">{pct(week)}</span>
              </div>
              <div className="area-name">{a.name}</div>
              <div className="muted small">
                {count} routines · {rules} rules
              </div>
              <ProgressBar ratio={week ?? 0} color={a.color} />
            </button>
          )
        })}
        <button className="area-card add" onClick={() => setAdding(true)}>
          <span className="area-icon">＋</span>
          <div className="area-name">Add area</div>
          <div className="muted small">Health, learning, family…</div>
        </button>
      </div>
      {adding && <AreaForm onClose={() => setAdding(false)} />}
    </div>
  )
}
