import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/HStack'
import { List, ListItem } from '@astryxdesign/core/List'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { VStack } from '@astryxdesign/core/VStack'
import { useMemo, useState } from 'react'
import { formatDay } from '../../core/dates'
import type { LogEntry, LogKind } from '../../core/types'
import { LogForm } from '../components/LogForm'
import { AreaTag, ConfirmButton, Empty, PageHeader, Section, money } from '../components/ui'
import { useAreas, useStore } from '../store'

type Filter = 'all' | LogKind

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'trade', label: 'Trades' },
  { key: 'workout', label: 'Workouts' },
  { key: 'money', label: 'Money' },
  { key: 'note', label: 'Notes' },
]

export function headline(entry: LogEntry, currency: string): string {
  switch (entry.kind) {
    case 'trade': {
      const { symbol, side, pnl } = entry.trade
      return `${symbol || 'Trade'} ${side} · ${money(pnl, currency)}`
    }
    case 'workout':
      return `${entry.workout.activity} · ${entry.workout.minutes} min`
    case 'money':
      return `${money(entry.money.amount, currency)} · ${entry.money.category}`
    case 'note':
      return 'Note'
  }
}

export function Journal() {
  const { state, dispatch } = useStore()
  const { byId } = useAreas()
  const [filter, setFilter] = useState<Filter>('all')
  const [adding, setAdding] = useState(false)
  const { currency } = state.settings

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

      {groups.length === 0 && <Empty title="No entries yet">Log your first trade, workout or expense.</Empty>}

      {groups.map((g) => (
        <Section key={g.date} title={formatDay(g.date)}>
          <List hasDividers>
            {g.entries.map((e) => (
              <ListItem
                key={e.id}
                label={headline(e, currency)}
                description={e.text || undefined}
                endContent={
                  <HStack gap={1} vAlign="center">
                    {e.kind === 'trade' && (
                      <Badge variant={e.trade.followedPlan ? 'success' : 'error'} label={e.trade.followedPlan ? 'Followed plan' : 'Broke plan'} />
                    )}
                    <AreaTag area={byId.get(e.areaId)} />
                    <ConfirmButton size="sm" label="Delete" confirmLabel="Delete?" onConfirm={() => dispatch({ type: 'removeLog', id: e.id })} />
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
