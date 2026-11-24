import { BottomSheet } from '@astryxdesign/core/BottomSheet'
import { Button } from '@astryxdesign/core/Button'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { ToggleButton, ToggleButtonGroup } from '@astryxdesign/core/ToggleButton'
import { VStack } from '@astryxdesign/core/VStack'
import { useState, type ReactNode } from 'react'
import { AREA_COLORS } from '../../core/defaults'
import { newId } from '../../core/ids'
import type { Area, Goal, Routine, Rule, Weekday } from '../../core/types'
import { useStore } from '../store'
import { areaTone } from './ui'

const DAY_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0]
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const COLOR_NAMES: Record<string, string> = { cyan: 'Sky', green: 'Green', yellow: 'Yellow', purple: 'Violet', pink: 'Pink', orange: 'Orange', teal: 'Teal' }

const clean = (s: string, max = 200): string => s.trim().slice(0, max)

interface FormShellProps {
  title: string
  onClose: () => void
  onSubmit: () => string | null
  onArchive?: () => void
  children: ReactNode
}

/**
 * Shared bottom sheet with Save / Archive. onSubmit returns an error message
 * to keep the sheet open, or null when saved.
 */
export function FormShell({ title, onClose, onSubmit, onArchive, children }: FormShellProps) {
  const [error, setError] = useState<string | null>(null)
  const save = () => {
    const err = onSubmit()
    setError(err)
    if (err === null) onClose()
  }
  return (
    <BottomSheet isOpen onOpenChange={(open) => !open && onClose()} label={title} purpose="form" height="capped">
      <VStack gap={4} padding={4}>
        <Heading level={2}>{title}</Heading>
        <FormLayout>{children}</FormLayout>
        {error && (
          <Text color="accent" role="alert">
            {error}
          </Text>
        )}
        <HStack gap={2} justify="end">
          {onArchive && (
            <Button
              variant="ghost"
              label="Archive"
              onClick={() => {
                onArchive()
                onClose()
              }}
            />
          )}
          <Button variant="primary" label="Save" onClick={save} />
        </HStack>
      </VStack>
    </BottomSheet>
  )
}

export function AreaForm({ area, onClose }: { area?: Area; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [name, setName] = useState(area?.name ?? '')
  const [icon, setIcon] = useState(area?.icon ?? '⭐')
  const [color, setColor] = useState<string>(area?.color ?? AREA_COLORS[state.areas.length % AREA_COLORS.length] ?? AREA_COLORS[0])

  const save = () => {
    if (!clean(name)) return 'Give the area a name.'
    const item: Area = { id: area?.id ?? newId(), name: clean(name, 40), icon: clean(icon, 4) || '⭐', color, archived: false }
    dispatch({ type: 'upsert', collection: 'areas', item })
    return null
  }

  return (
    <FormShell
      title={area ? 'Edit area' : 'New area'}
      onClose={onClose}
      onSubmit={save}
      onArchive={area && (() => dispatch({ type: 'archive', collection: 'areas', id: area.id }))}
    >
      <TextInput label="Name" value={name} onChange={setName} placeholder="Health, Learning…" isRequired />
      <TextInput label="Icon (emoji)" value={icon} onChange={setIcon} />
      <ToggleButtonGroup label="Colour" type="single" value={color} onChange={(c) => c && setColor(c)}>
        {AREA_COLORS.map((c) => (
          <ToggleButton key={c} value={c} label={COLOR_NAMES[areaTone(c)] ?? c} />
        ))}
      </ToggleButtonGroup>
    </FormShell>
  )
}

export function RoutineForm({ areaId, routine, onClose }: { areaId: string; routine?: Routine; onClose: () => void }) {
  const { dispatch } = useStore()
  const [title, setTitle] = useState(routine?.title ?? '')
  const [days, setDays] = useState<string[]>((routine?.days ?? [1, 2, 3, 4, 5]).map(String))
  const [timeOfDay, setTimeOfDay] = useState<Routine['timeOfDay']>(routine?.timeOfDay ?? 'morning')

  const save = () => {
    if (!clean(title)) return 'Say what you do.'
    if (days.length === 0) return 'Pick at least one day.'
    const item: Routine = {
      id: routine?.id ?? newId(),
      areaId,
      title: clean(title),
      days: days.map((d) => Number(d) as Weekday).sort(),
      timeOfDay,
      archived: false,
    }
    dispatch({ type: 'upsert', collection: 'routines', item })
    return null
  }

  return (
    <FormShell
      title={routine ? 'Edit routine' : 'New routine'}
      onClose={onClose}
      onSubmit={save}
      onArchive={routine && (() => dispatch({ type: 'archive', collection: 'routines', id: routine.id }))}
    >
      <TextInput label="What do you do?" value={title} onChange={setTitle} placeholder="Pre-market prep" isRequired />
      <ToggleButtonGroup label="Days" type="multiple" value={days} onChange={setDays} size="sm">
        {DAY_ORDER.map((d) => (
          <ToggleButton key={d} value={String(d)} label={DAY_SHORT[d]} />
        ))}
      </ToggleButtonGroup>
      <Selector
        label="When"
        value={timeOfDay}
        onChange={(v) => setTimeOfDay(v as Routine['timeOfDay'])}
        options={[
          { value: 'morning', label: 'Morning' },
          { value: 'anytime', label: 'During the day' },
          { value: 'evening', label: 'Evening' },
        ]}
      />
    </FormShell>
  )
}

export function RuleForm({ areaId, rule, onClose }: { areaId: string; rule?: Rule; onClose: () => void }) {
  const { dispatch } = useStore()
  const [text, setText] = useState(rule?.text ?? '')

  const save = () => {
    if (!clean(text)) return 'Write the rule.'
    dispatch({ type: 'upsert', collection: 'rules', item: { id: rule?.id ?? newId(), areaId, text: clean(text, 300), archived: false } })
    return null
  }

  return (
    <FormShell
      title={rule ? 'Edit rule' : 'New rule'}
      onClose={onClose}
      onSubmit={save}
      onArchive={rule && (() => dispatch({ type: 'archive', collection: 'rules', id: rule.id }))}
    >
      <TextArea label="Rule" value={text} onChange={setText} placeholder="No trades in the first 15 minutes" rows={3} isRequired />
    </FormShell>
  )
}

export function GoalForm({ areaId, goal, onClose }: { areaId: string; goal?: Goal; onClose: () => void }) {
  const { dispatch } = useStore()
  const [title, setTitle] = useState(goal?.title ?? '')
  const [target, setTarget] = useState<number | undefined>(goal?.target)
  const [unit, setUnit] = useState(goal?.unit ?? '')
  const [period, setPeriod] = useState<Goal['period']>(goal?.period ?? 'weekly')
  const [direction, setDirection] = useState<Goal['direction']>(goal?.direction ?? 'atLeast')

  const save = () => {
    if (!clean(title)) return 'Name the goal.'
    if (target === undefined || !Number.isFinite(target) || target <= 0) return 'Set a target above 0.'
    const item: Goal = { id: goal?.id ?? newId(), areaId, title: clean(title), target, unit: clean(unit, 20), period, direction, archived: false }
    dispatch({ type: 'upsert', collection: 'goals', item })
    return null
  }

  return (
    <FormShell
      title={goal ? 'Edit goal' : 'New goal'}
      onClose={onClose}
      onSubmit={save}
      onArchive={goal && (() => dispatch({ type: 'archive', collection: 'goals', id: goal.id }))}
    >
      <TextInput label="Goal" value={title} onChange={setTitle} placeholder="Training sessions" isRequired />
      <NumberInput label="Target" value={target} onChange={(n) => setTarget(Number.isFinite(n) ? n : undefined)} placeholder="4" isRequired />
      <TextInput label="Unit" value={unit} onChange={setUnit} placeholder="sessions" />
      <Selector
        label="Per"
        value={period}
        onChange={(v) => setPeriod(v as Goal['period'])}
        options={[
          { value: 'daily', label: 'Day' },
          { value: 'weekly', label: 'Week' },
          { value: 'monthly', label: 'Month' },
          { value: 'yearly', label: 'Year' },
        ]}
      />
      <Selector
        label="Type"
        value={direction}
        onChange={(v) => setDirection(v as Goal['direction'])}
        options={[
          { value: 'atLeast', label: 'Reach at least' },
          { value: 'atMost', label: 'Stay under (budget)' },
        ]}
      />
    </FormShell>
  )
}
