import { useMemo, useState } from 'react'
import { formatDay } from '../../core/dates'
import type { LogEntry, LogKind } from '../../core/types'
import { LogForm } from '../components/LogForm'
import { Dot, Empty, money } from '../components/ui'
import { useAreas, useStore } from '../store'

type Filter = 'all' | LogKind

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'trade', label: 'Trades' },
  { key: 'workout', label: 'Workouts' },
  { key: 'money', label: 'Money' },
  { key: 'note', label: 'Notes' },
]

function Headline({ entry, currency }: { entry: LogEntry; currency: string }) {
  switch (entry.kind) {
    case 'trade': {
      const { symbol, side, pnl, followedPlan } = entry.trade
      return (
        <>
          <strong>{symbol || 'Trade'}</strong> {side} ·{' '}
          <span className={pnl >= 0 ? 'pos' : 'neg'}>{money(pnl, currency)}</span>
          <span className={`pill ${followedPlan ? 'good' : 'bad'}`}>{followedPlan ? 'Followed plan' : 'Broke plan'}</span>
        </>
      )
    }
    case 'workout':
      return (
        <>
          <strong>{entry.workout.activity}</strong> · {entry.workout.minutes} min
        </>
      )
    case 'money':
      return (
        <>
          <strong className={entry.money.amount >= 0 ? 'pos' : 'neg'}>{money(entry.money.amount, currency)}</strong> ·{' '}
          {entry.money.category}
        </>
      )
    case 'note':
      return <strong>Note</strong>
  }
}

export function Journal() {
  const { state, dispatch } = useStore()
  const { byId } = useAreas()
  const [filter, setFilter] = useState<Filter>('all')
  const [adding, setAdding] = useState(false)

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

  const remove = (entry: LogEntry) => {
    if (window.confirm('Delete this entry?')) dispatch({ type: 'removeLog', id: entry.id })
  }

  return (
    <div className="screen">
      <header className="hero-head row-between">
        <div>
          <h1>Journal</h1>
          <p className="sub">Trades, workouts, money and notes.</p>
        </div>
        <button className="btn primary" onClick={() => setAdding(true)}>
          + Entry
        </button>
      </header>

      <div className="filters">
        {FILTERS.map((f) => (
          <button key={f.key} className={`chip ${filter === f.key ? 'on' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {groups.length === 0 && <Empty>No entries yet. Log your first trade, workout or expense.</Empty>}

      {groups.map((g) => (
        <section key={g.date} className="section">
          <h2 className="day-head">{formatDay(g.date)}</h2>
          {g.entries.map((e) => {
            const area = byId.get(e.areaId)
            return (
              <article key={e.id} className="log">
                <div className="log-top">
                  <span className="log-head">
                    <Headline entry={e} currency={state.settings.currency} />
                  </span>
                  <button className="icon-btn" onClick={() => remove(e)} aria-label="Delete entry">
                    ✕
                  </button>
                </div>
                {e.text && <p className="log-text">{e.text}</p>}
                {area && (
                  <span className="tag">
                    <Dot color={area.color} />
                    {area.name}
                  </span>
                )}
              </article>
            )
          })}
        </section>
      ))}

      {adding && <LogForm onClose={() => setAdding(false)} />}
    </div>
  )
}
