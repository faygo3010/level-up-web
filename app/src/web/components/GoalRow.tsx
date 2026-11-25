import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/HStack'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { useState } from 'react'
import { withUnit } from '../../core/format'
import { newId } from '../../core/ids'
import { goalProgress, type GoalProgress } from '../../core/progress'
import type { Goal } from '../../core/types'
import { useStore } from '../store'
import { statusVariant } from './ui'

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
    if (p.status === 'over') return `Over by ${withUnit(p.current - p.target, goal.unit)} ${period}.`
    return `${withUnit(p.remaining, goal.unit)} left ${period}.`
  }
  if (p.status === 'done') return `Done ${period}.`
  return `${withUnit(p.remaining, goal.unit)} to go ${period}.`
}

export function GoalRow({ goal }: { goal: Goal }) {
  const { state, dispatch, today } = useStore()
  const [value, setValue] = useState<number | null>(null)
  const progress = goalProgress(goal, state.goalEntries, today, state.settings.weekStartsOn, state.logs)

  const log = (amount: number | null) => {
    if (amount === null || !Number.isFinite(amount) || amount === 0) return
    dispatch({ type: 'addGoalEntry', entry: { id: newId(), goalId: goal.id, date: today, value: amount } })
  }

  return (
    <VStack gap={1.5}>
      <ProgressBar
        label={goal.title}
        value={Math.min(progress.current, goal.target)}
        max={goal.target || 1}
        hasValueLabel
        formatValueLabel={() => `${fmt(progress.current)} / ${withUnit(goal.target, goal.unit)}`}
        variant={progress.current === 0 ? 'neutral' : statusVariant(progress.status)}
      />
      <HStack justify="between" vAlign="center" gap={2} wrap="wrap">
        <Text type="supporting" color={progress.status === 'behind' || progress.status === 'over' ? 'accent' : 'secondary'}>
          {describeProgress(goal, progress)}
        </Text>
        <HStack gap={1} vAlign="end">
          <Button size="sm" variant="secondary" label="+1" aria-label={`Add 1 to ${goal.title}`} onClick={() => log(1)} />
          <NumberInput
            size="sm"
            label={`Log amount for ${goal.title}`}
            isLabelHidden
            placeholder="amount"
            value={value ?? undefined}
            onChange={(n) => setValue(Number.isFinite(n) ? n : null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                log(value)
                setValue(null)
              }
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            label="Log"
            aria-label={`Log amount for ${goal.title} now`}
            onClick={() => {
              log(value)
              setValue(null)
            }}
          />
        </HStack>
      </HStack>
    </VStack>
  )
}
