import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/HStack'
import { List, ListItem } from '@astryxdesign/core/List'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { useMemo, useState } from 'react'
import { formatDay } from '../../core/dates'
import type { LogEntry, LogKind } from '../../core/types'
import { LogForm } from '../components/LogForm'
import { ConfirmButton, Empty, PageHeader, Section, focusFirst, money } from '../components/ui'
import { useAreas, useStore } from '../store'

type Filter = 'all' | LogKind

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'trade', label: 'Trades' },
  { key: 'workout', label: 'Workouts' },
  { key: 'money', label: 'Money' },
  { key: 'note', label: 'Notes' },
]

/** Row title without the amount, so the amount can sit on its own, never truncated. */
export function headline(entry: LogEntry): string {
  switch (entry.kind) {
    case 'trade':
      return `${entry.trade.symbol || 'Trade'} ${entry.trade.side}`
    case 'workout':
      return `${entry.workout.activity} · ${entry.workout.minutes} min`
    case 'money':
      return entry.money.category
    case 'note':
      return 'Note'
  }
}

/** The signed amount for trades and money, shown on the right in colour. */
export function amountOf(entry: LogEntry, currency: string): { text: string; positive: boolean } | null {
  if (entry.kind === 'trade') return { text: money(entry.trade.pnl, currency), positive: entry.trade.pnl >= 0 }
  if (entry.kind === 'money') return { text: money(entry.money.amount, currency), positive: entry.money.amount >= 0 }
  return null
}

function details(entry: LogEntry, areaName: string | undefined): string {
  const parts = [
    entry.kind === 'trade' ? (entry.trade.followedPlan ? 'Followed plan' : 'Broke plan') : null,
    areaName ?? null,
    entry.text || null,
  ]
  return parts.filter(Boolean).join(' · ')
}

export function Journal() {
  const { state, dispatch } = useStore()
  const { byId } = useAreas()
  const [filter, setFilter] = useState<Filter>('all')
  const [adding, setAdding] = useState(false)
  const { currency } = state.settings

  const remove = (id: string) => {
    dispatch({ type: 'removeLog', id })
    // The row (and its button) disappears; keep keyboard focus nearby.
    requestAnimationFrame(() => focusFirst('[aria-label^="Delete "]'))
  }

  const groups = useMemo(() => {
    const items = state.logs.filter((l) => filter === 'all' || l.kind === filter)
    const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
    return sorted.reduce<{ date: string; entries: LogEntry[] }[]>((acc, entry) => {
      const last = acc[acc.length - 1]
      return last && last.date === entry.date
        ? [...acc.slice(0, -1), { date: last.date, entries: [...last.entries, entry] }]
        : [...acc, { date: entry.date, entries: [entry] }]
    }, [])
  }, [state.logs, filter])

  return (
    <VStack gap={6}>
      <PageHeader
        title="Journal"
        subtitle="Trades, workouts, money and notes."
        action={<Button variant="primary" size="sm" label="New entry" onClick={() => setAdding(true)} />}
      />

      <SegmentedControl label="Show" value={filter} onChange={(v) => setFilter(v as Filter)} layout="fill" size="sm">
        {FILTERS.map((f) => (
          <SegmentedControlItem key={f.key} value={f.key} label={f.label} />
        ))}
      </SegmentedControl>

      {groups.length === 0 && (
        <Empty title="No entries yet" headingLevel={2}>
          Log your first trade, workout or expense.
        </Empty>
      )}

      {groups.map((g) => (
        <Section key={g.date} title={formatDay(g.date)}>
          <List hasDividers>
            {g.entries.map((e) => (
              <ListItem
                key={e.id}
                label={headline(e)}
                description={details(e, byId.get(e.areaId)?.name)}
                startContent={e.kind === 'trade' ? <StatusDot variant={e.trade.followedPlan ? 'success' : 'error'} label={e.trade.followedPlan ? 'Followed plan' : 'Broke plan'} /> : undefined}
                endContent={
                  <HStack gap={1} vAlign="center">
                    {amountOf(e, currency) && (
                      <Text weight="semibold" hasTabularNumbers color={amountOf(e, currency)!.positive ? 'primary' : 'accent'}>
                        {amountOf(e, currency)!.text}
                      </Text>
                    )}
                    <ConfirmButton size="sm" label="Delete" confirmLabel="Delete?" ariaLabel={`Delete ${headline(e)} entry`} onConfirm={() => remove(e.id)} />
                  </HStack>
                }
              />
            ))}
          </List>
        </Section>
      ))}

      {adding && <LogForm onClose={() => setAdding(false)} />}
    </VStack>
  )
}
