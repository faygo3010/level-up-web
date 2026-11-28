import { Button } from '@astryxdesign/core/Button'
import { CheckboxList, CheckboxListItem } from '@astryxdesign/core/CheckboxList'
import { ClickableCard } from '@astryxdesign/core/ClickableCard'
import { Divider } from '@astryxdesign/core/Divider'
import { Grid } from '@astryxdesign/core/Grid'
import { HStack } from '@astryxdesign/core/HStack'
import { List, ListItem } from '@astryxdesign/core/List'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { useState } from 'react'
import { dayAgenda, dayDigest, monthGrid, monthLabel, shiftMonth, weekdayLabels, type DayAgenda, type MonthKey } from '../../core/agenda'
import { formatDay, monthKey } from '../../core/dates'
import { withUnit } from '../../core/format'
import type { DateKey } from '../../core/types'
import { LogForm } from '../components/LogForm'
import { RuleCheck } from '../components/RuleCheck'
import { AreaTag, Empty, HeatLegend, PageHeader, Section, heatTone, money, pct, plural } from '../components/ui'
import { useAreas, useStore } from '../store'
import { amountOf, details, headline } from './Journal'

/** What a screen reader hears for one day cell. */
export function cellLabel(date: DateKey, score: number | null, entries: number, isToday: boolean, isSelected: boolean): string {
  const parts = [
    formatDay(date),
    isToday ? 'today' : null,
    score === null ? null : `${pct(score)} done`,
    entries > 0 ? plural(entries, 'journal entry').replace('entrys', 'entries') : null,
    isSelected ? 'selected' : null,
  ]
  return parts.filter(Boolean).join(', ')
}

export function agendaSummary(a: DayAgenda): string {
  const done = a.routines.filter((r) => r.done).length
  const kept = a.rules.filter((r) => r.kept === true).length
  if (a.when === 'future') return a.routines.length ? `Planned: ${plural(a.routines.length, 'routine')}.` : 'Nothing planned.'
  if (a.score === null) return a.logs.length ? 'No routines scheduled.' : 'Nothing scheduled.'
  return `${done} of ${a.routines.length} routines done · ${kept} of ${a.rules.length} rules kept (${pct(a.score)}).`
}

export function Calendar() {
  const { state, dispatch, today } = useStore()
  const { byId } = useAreas()
  const [month, setMonth] = useState<MonthKey>(() => monthKey(today))
  const [selected, setSelected] = useState<DateKey>(today)
  const [adding, setAdding] = useState(false)
  const { weekStartsOn, currency } = state.settings
  const weeks = monthGrid(month, weekStartsOn)
  const agenda = dayAgenda(state, selected, today)
  const canEdit = agenda.when !== 'future'

  const pick = (d: DateKey) => {
    setSelected(d)
    if (monthKey(d) !== month) setMonth(monthKey(d))
  }
  const goToday = () => {
    setMonth(monthKey(today))
    setSelected(today)
  }

  const toggleRoutines = (next: string[]) => {
    for (const { routine, done } of agenda.routines) {
      if (done !== next.includes(routine.id)) dispatch({ type: 'toggleRoutine', date: selected, routineId: routine.id })
    }
  }

  return (
    <VStack gap={6}>
      <PageHeader
        eyebrow="Calendar"
        title={monthLabel(month)}
        subtitle="Tap a day to see and fill in everything from it."
        action={
          <HStack gap={1}>
            <Button size="sm" variant="ghost" label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
              ‹
            </Button>
            <Button size="sm" variant="secondary" label="Go to today" onClick={goToday}>
              Today
            </Button>
            <Button size="sm" variant="ghost" label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>
              ›
            </Button>
          </HStack>
        }
      />

      <VStack gap={2}>
        <Grid columns={7} gap={1} justify="center" aria-hidden>
          {weekdayLabels(weekStartsOn).map((d) => (
            <Text key={d} type="supporting" color="secondary">
              {d}
            </Text>
          ))}
        </Grid>
        <Grid columns={7} gap={1} role="list" aria-label={`${monthLabel(month)}, by day`}>
          {weeks.flat().map((d) => {
            const digest = dayDigest(state, d, today)
            const outside = monthKey(d) !== month
            const isToday = d === today
            const isSelected = d === selected
            return (
              <ClickableCard
                key={d}
                role="listitem"
                label={cellLabel(d, digest.score, digest.entries, isToday, isSelected)}
                onClick={() => pick(d)}
                variant={outside ? 'transparent' : d > today ? 'default' : heatTone(digest.score)}
                elevation={isSelected ? 'high' : 'none'}
                padding={1}
                height={56}
              >
                <VStack gap={0.5} hAlign="center">
                  <Text
                    hasTabularNumbers
                    weight={isToday || isSelected ? 'bold' : 'normal'}
                    color={isSelected ? 'accent' : outside ? 'secondary' : 'primary'}
                  >
                    {Number(d.slice(8))}
                  </Text>
                  {digest.entries > 0 && (
                    <StatusDot
                      variant={digest.pnl === null ? 'neutral' : digest.pnl >= 0 ? 'success' : 'error'}
                      label={digest.pnl === null ? 'Journal entries' : `Trading ${money(digest.pnl, currency)}`}
                    />
                  )}
                </VStack>
              </ClickableCard>
            )
          })}
        </Grid>
        <HeatLegend />
      </VStack>

      <Section
        title={selected === today ? `Today · ${formatDay(selected)}` : formatDay(selected)}
        action={canEdit && <Button size="sm" variant="primary" label="Log entry" onClick={() => setAdding(true)} />}
      >
        <Text color="secondary">{agendaSummary(agenda)}</Text>

        {agenda.routines.length > 0 && (
          <CheckboxList
            label="Routines"
            value={agenda.routines.filter((r) => r.done).map((r) => r.routine.id)}
            onChange={toggleRoutines}
            isReadOnly={!canEdit}
            hasDividers
          >
            {agenda.routines.map(({ routine }) => (
              <CheckboxListItem key={routine.id} value={routine.id} label={routine.title} endContent={<AreaTag area={byId.get(routine.areaId)} />} />
            ))}
          </CheckboxList>
        )}

        {canEdit && agenda.rules.length > 0 && (
          <VStack gap={0}>
            <Text type="label">Rules</Text>
            {agenda.rules.map(({ rule }, i) => (
              <VStack key={rule.id} gap={0}>
                {i > 0 && <Divider />}
                <RuleCheck rule={rule} area={byId.get(rule.areaId)} date={selected} />
              </VStack>
            ))}
          </VStack>
        )}

        {(agenda.logs.length > 0 || agenda.goalEntries.length > 0) && (
          <VStack gap={1}>
          <Text type="label">Logged</Text>
          <List hasDividers>
            {agenda.logs.map((l) => {
              const amount = amountOf(l, currency)
              return (
                <ListItem
                  key={l.id}
                  label={headline(l)}
                  description={details(l, byId.get(l.areaId)?.name) || undefined}
                  endContent={
                    amount && (
                      <Text weight="semibold" hasTabularNumbers color={amount.positive ? 'primary' : 'accent'}>
                        {amount.text}
                      </Text>
                    )
                  }
                />
              )
            })}
            {agenda.goalEntries.map(({ entry, goal }) => (
              <ListItem key={entry.id} label={goal.title} description="Goal progress" endContent={<Text hasTabularNumbers>+{withUnit(entry.value, goal.unit)}</Text>} />
            ))}
          </List>
          </VStack>
        )}

        {agenda.routines.length === 0 && agenda.logs.length === 0 && agenda.goalEntries.length === 0 && (!canEdit || agenda.rules.length === 0) && (
          <Empty>Nothing on this day.</Empty>
        )}
      </Section>

      {adding && <LogForm date={selected} onClose={() => setAdding(false)} />}
    </VStack>
  )
}
