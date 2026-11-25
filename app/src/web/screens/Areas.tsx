import { Button } from '@astryxdesign/core/Button'
import { ClickableCard } from '@astryxdesign/core/ClickableCard'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { List, ListItem } from '@astryxdesign/core/List'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { VStack } from '@astryxdesign/core/VStack'
import { useEffect, useState } from 'react'
import { areaAdherence } from '../../core/adherence'
import { describeDays } from '../../core/format'
import type { Area, Goal, Routine, Rule } from '../../core/types'
import { AreaForm, GoalForm, RoutineForm, RuleForm } from '../components/forms'
import { GoalRow } from '../components/GoalRow'
import { Empty, PageHeader, Section, areaTone, focusFirst, focusPageTitle, pct, plural } from '../components/ui'
import { useAreas, useStore } from '../store'

type Editing =
  | { kind: 'area'; area?: Area }
  | { kind: 'routine'; routine?: Routine }
  | { kind: 'rule'; rule?: Rule }
  | { kind: 'goal'; goal?: Goal }
  | null

const AddButton = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <Button size="sm" variant="secondary" label="Add" aria-label={label} onClick={onClick} />
)

function AreaDetail({ area, onBack }: { area: Area; onBack: () => void }) {
  const { state } = useStore()
  useEffect(() => focusPageTitle(), [area.id])
  const [editing, setEditing] = useState<Editing>(null)
  const close = () => setEditing(null)
  const routines = state.routines.filter((r) => r.areaId === area.id && !r.archived)
  const rules = state.rules.filter((r) => r.areaId === area.id && !r.archived)
  const goals = state.goals.filter((g) => g.areaId === area.id && !g.archived)

  return (
    <VStack gap={6}>
      <HStack>
        <Button variant="ghost" size="sm" label="‹ Areas" onClick={onBack} />
      </HStack>
      <PageHeader
        title={`${area.icon} ${area.name}`}
        action={<Button variant="secondary" size="sm" label="Edit" onClick={() => setEditing({ kind: 'area', area })} />}
      />

      <Section title="Routines" action={<AddButton label="Add routine" onClick={() => setEditing({ kind: 'routine' })} />}>
        {routines.length === 0 ? (
          <Empty>No routines yet. What do you do every time?</Empty>
        ) : (
          <List hasDividers>
            {routines.map((r) => (
              <ListItem key={r.id} label={r.title} description={`${describeDays(r.days)} · ${r.timeOfDay}`} onClick={() => setEditing({ kind: 'routine', routine: r })} />
            ))}
          </List>
        )}
      </Section>

      <Section title="Playbook rules" action={<AddButton label="Add rule" onClick={() => setEditing({ kind: 'rule' })} />}>
        {rules.length === 0 ? (
          <Empty>No rules yet. What do you never do?</Empty>
        ) : (
          <List hasDividers listStyle="decimal">
            {rules.map((r) => (
              <ListItem key={r.id} label={r.text} onClick={() => setEditing({ kind: 'rule', rule: r })} />
            ))}
          </List>
        )}
      </Section>

      <Section title="Goals" action={<AddButton label="Add goal" onClick={() => setEditing({ kind: 'goal' })} />}>
        {goals.length === 0 ? (
          <Empty>No goals yet. What does progress look like?</Empty>
        ) : (
          <VStack gap={5}>
            {goals.map((g) => (
              <VStack key={g.id} gap={1} hAlign="stretch">
                <GoalRow goal={g} />
                <HStack justify="end">
                  <Button variant="ghost" size="sm" label="Edit goal" aria-label={`Edit goal ${g.title}`} onClick={() => setEditing({ kind: 'goal', goal: g })} />
                </HStack>
              </VStack>
            ))}
          </VStack>
        )}
      </Section>

      {editing?.kind === 'area' && <AreaForm area={editing.area} onClose={close} />}
      {editing?.kind === 'routine' && <RoutineForm areaId={area.id} routine={editing.routine} onClose={close} />}
      {editing?.kind === 'rule' && <RuleForm areaId={area.id} rule={editing.rule} onClose={close} />}
      {editing?.kind === 'goal' && <GoalForm areaId={area.id} goal={editing.goal} onClose={close} />}
    </VStack>
  )
}

export function Areas() {
  const { state, today } = useStore()
  const { active, byId } = useAreas()
  const [selected, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const area = selected ? byId.get(selected) : undefined
  const back = () => {
    const name = byId.get(selected ?? '')?.name ?? ''
    setSelected(null)
    // Return focus to the card the user opened.
    requestAnimationFrame(() => focusFirst(`[aria-label="Open ${name}"]`))
  }
  if (area && !area.archived) return <AreaDetail area={area} onBack={back} />

  return (
    <VStack gap={6}>
      <PageHeader
        title="Areas"
        subtitle="Each area of your life has its own routines, rules and goals."
        action={<Button variant="primary" size="sm" label="Add area" onClick={() => setAdding(true)} />}
      />
      {active.length === 0 && <Empty title="No areas yet">Add one for each part of your life you want to run on a system.</Empty>}
      <Grid columns={{ minWidth: 260 }} gap={3}>
        {active.map((a) => {
          const week = areaAdherence(state, a.id, today, 7)
          const routines = state.routines.filter((r) => r.areaId === a.id && !r.archived).length
          const rules = state.rules.filter((r) => r.areaId === a.id && !r.archived).length
          return (
            <ClickableCard key={a.id} label={`Open ${a.name}`} onClick={() => setSelected(a.id)} padding={4}>
              <VStack gap={2}>
                <HStack justify="between" vAlign="center">
                  <Heading level={2}>
                    {a.icon} {a.name}
                  </Heading>
                  <Token label={`${pct(week)} this week`} color={areaTone(a.color)} size="sm" />
                </HStack>
                <Text type="supporting" color="secondary">
                  {plural(routines, 'routine')} · {plural(rules, 'rule')}
                </Text>
                <ProgressBar label={`${a.name} adherence this week`} isLabelHidden value={Math.round((week ?? 0) * 100)} max={100} />
              </VStack>
            </ClickableCard>
          )
        })}
      </Grid>
      {adding && <AreaForm onClose={() => setAdding(false)} />}
    </VStack>
  )
}
