import { CheckboxList, CheckboxListItem } from '@astryxdesign/core/CheckboxList'
import { Divider } from '@astryxdesign/core/Divider'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Token } from '@astryxdesign/core/Token'
import { VisuallyHidden } from '@astryxdesign/core/VisuallyHidden'
import { VStack } from '@astryxdesign/core/VStack'
import { currentStreak, dayScore, scheduledRoutines } from '../../core/adherence'
import { formatDay } from '../../core/dates'
import type { TimeOfDay } from '../../core/types'
import { GoalRow } from '../components/GoalRow'
import { RuleCheck } from '../components/RuleCheck'
import { Empty, PageHeader, Section, areaTone } from '../components/ui'
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

/** Plain, honest summary. No exclamation marks. Routines and rules are counted separately. */
export function summaryLine(routinesDone: number, routinesTotal: number, rulesKept: number, rulesTotal: number, streak: number): string {
  if (routinesTotal + rulesTotal === 0) return 'Nothing scheduled today. Rest is part of the system.'
  const parts = [
    routinesTotal > 0 ? (routinesDone === routinesTotal ? `All ${routinesTotal} routines done` : `${routinesDone} of ${routinesTotal} routines done`) : null,
    rulesTotal > 0 ? `${rulesKept} of ${rulesTotal} rules kept` : null,
  ].filter(Boolean)
  const base = `${parts.join(' · ')}.`
  return streak > 0 ? `${base} Streak: ${streak} day${streak === 1 ? '' : 's'}.` : base
}

export function Today() {
  const { state, dispatch, today } = useStore()
  const { byId } = useAreas()
  const score = dayScore(state, today)
  const streak = currentStreak(state, today)
  const routines = scheduledRoutines(state, today)
  const completed = state.completions[today] ?? []
  const rules = state.rules.filter((r) => !r.archived)
  const goals = state.goals.filter((g) => !g.archived)
  const routinesDone = routines.filter((r) => completed.includes(r.id)).length
  const rulesKept = rules.filter((r) => state.ruleChecks[today]?.[r.id] === true).length
  const summary = summaryLine(routinesDone, routines.length, rulesKept, rules.length, streak)

  /** CheckboxList reports the full checked set; toggle whatever changed. */
  const onSlotChange = (slotIds: readonly string[], next: string[]) => {
    for (const id of slotIds) {
      if (completed.includes(id) !== next.includes(id)) dispatch({ type: 'toggleRoutine', date: today, routineId: id })
    }
  }

  return (
    <VStack gap={6}>
      <VStack gap={3}>
        <PageHeader eyebrow={formatDay(today)} title={greeting(new Date().getHours())} subtitle={summary} />
        {/* Announce progress changes to screen readers (the subtitle updates silently otherwise). */}
        <VisuallyHidden role="status" aria-live="polite">
          {summary}
        </VisuallyHidden>
        <ProgressBar label="Today's progress" isLabelHidden value={score.done} max={Math.max(score.total, 1)} variant={score.total > 0 && score.done === score.total ? 'success' : 'accent'} />
      </VStack>

      {routines.length === 0 && rules.length === 0 && goals.length === 0 && (
        <Empty title="Your system is empty" headingLevel={2}>Add routines, rules and goals in Areas.</Empty>
      )}

      {SLOTS.map(({ key, label }) => {
        const items = routines.filter((r) => r.timeOfDay === key)
        if (items.length === 0) return null
        const ids = items.map((r) => r.id)
        return (
          <CheckboxList
            key={key}
            label={label}
            value={completed.filter((id) => ids.includes(id))}
            onChange={(next) => onSlotChange(ids, next)}
            hasDividers
          >
            {items.map((r) => {
              const area = byId.get(r.areaId)
              return (
                <CheckboxListItem
                  key={r.id}
                  value={r.id}
                  label={r.title}
                  endContent={area && <Token label={area.name} color={areaTone(area.color)} size="sm" />}
                />
              )
            })}
          </CheckboxList>
        )
      })}

      {rules.length > 0 && (
        <Section title="Rules check">
          <VStack gap={0}>
            {rules.map((r, i) => (
              <VStack key={r.id} gap={0}>
                {i > 0 && <Divider />}
                <RuleCheck rule={r} area={byId.get(r.areaId)} />
              </VStack>
            ))}
          </VStack>
        </Section>
      )}

      {goals.length > 0 && (
        <Section title="Goals">
          <VStack gap={5}>
            {goals.map((g) => (
              <GoalRow key={g.id} goal={g} />
            ))}
          </VStack>
        </Section>
      )}
    </VStack>
  )
}
