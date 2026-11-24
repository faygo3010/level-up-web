import { useState } from 'react'
import { newId } from '../../core/ids'
import type { LogEntry, LogKind } from '../../core/types'
import { useAreas, useStore } from '../store'
import { Field, Sheet } from './ui'

const KINDS: { kind: LogKind; label: string }[] = [
  { kind: 'trade', label: 'Trade' },
  { kind: 'workout', label: 'Workout' },
  { kind: 'money', label: 'Money' },
  { kind: 'note', label: 'Note' },
]

/** Pick the area that best matches the entry type, falling back to the first. */
function defaultArea(kind: LogKind, areas: readonly { id: string; name: string }[]): string {
  const hint: Record<LogKind, string> = { trade: 'trad', workout: 'fit', money: 'fin', note: 'work' }
  return areas.find((a) => a.name.toLowerCase().includes(hint[kind]))?.id ?? areas[0]?.id ?? ''
}

const num = (s: string): number | null => {
  const n = Number(s)
  return s.trim() !== '' && Number.isFinite(n) ? n : null
}

export function LogForm({ onClose }: { onClose: () => void }) {
  const { dispatch, today } = useStore()
  const { active } = useAreas()
  const [kind, setKind] = useState<LogKind>('trade')
  const [areaId, setAreaId] = useState(() => defaultArea('trade', active))
  const [date, setDate] = useState(today)
  const [text, setText] = useState('')
  const [symbol, setSymbol] = useState('')
  const [side, setSide] = useState<'long' | 'short'>('long')
  const [pnl, setPnl] = useState('')
  const [followedPlan, setFollowedPlan] = useState(true)
  const [activity, setActivity] = useState('')
  const [minutes, setMinutes] = useState('')
  const [amount, setAmount] = useState('')
  const [isIncome, setIsIncome] = useState(false)
  const [category, setCategory] = useState('')
  const [error, setError] = useState('')

  const pickKind = (k: LogKind) => {
    setKind(k)
    setAreaId(defaultArea(k, active))
    setError('')
  }

  const build = (): LogEntry | string => {
    const base = { id: newId(), areaId, date, text: text.trim().slice(0, 2000), createdAt: Date.now() }
    if (!areaId) return 'Add an area first.'
    switch (kind) {
      case 'note':
        return base.text ? { ...base, kind } : 'Write something first.'
      case 'trade': {
        const p = num(pnl)
        if (p === null) return 'Enter the P&L (negative for a loss).'
        return { ...base, kind, trade: { symbol: symbol.trim().toUpperCase().slice(0, 20), side, pnl: p, followedPlan } }
      }
      case 'workout': {
        const m = num(minutes)
        if (m === null || m < 0) return 'Enter how many minutes.'
        return { ...base, kind, workout: { activity: activity.trim().slice(0, 60) || 'Workout', minutes: m } }
      }
      case 'money': {
        const a = num(amount)
        if (a === null || a === 0) return 'Enter an amount.'
        const signed = isIncome ? Math.abs(a) : -Math.abs(a)
        return { ...base, kind, money: { amount: signed, category: category.trim().toLowerCase().slice(0, 40) || 'other' } }
      }
    }
  }

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const result = build()
    if (typeof result === 'string') return setError(result)
    dispatch({ type: 'addLog', entry: result })
    onClose()
  }

  return (
    <Sheet title="New journal entry" onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="seg wide" role="tablist">
          {KINDS.map((k) => (
            <button key={k.kind} type="button" role="tab" aria-selected={kind === k.kind} className={kind === k.kind ? 'on' : ''} onClick={() => pickKind(k.kind)}>
              {k.label}
            </button>
          ))}
        </div>

        {kind === 'trade' && (
          <>
            <div className="row">
              <Field label="Symbol">
                <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="ES, AAPL, BTC" />
              </Field>
              <Field label="Side">
                <select value={side} onChange={(e) => setSide(e.target.value as 'long' | 'short')}>
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </Field>
            </div>
            <Field label="P&L">
              <input inputMode="decimal" value={pnl} onChange={(e) => setPnl(e.target.value)} placeholder="-120 or 250" />
            </Field>
            <label className="toggle">
              <input type="checkbox" checked={followedPlan} onChange={(e) => setFollowedPlan(e.target.checked)} />
              <span>I followed my plan and rules on this trade</span>
            </label>
          </>
        )}

        {kind === 'workout' && (
          <div className="row">
            <Field label="Activity">
              <input value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="Run, lift, swim" />
            </Field>
            <Field label="Minutes">
              <input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="45" />
            </Field>
          </div>
        )}

        {kind === 'money' && (
          <>
            <div className="seg wide">
              <button type="button" className={!isIncome ? 'on' : ''} onClick={() => setIsIncome(false)}>
                Spent
              </button>
              <button type="button" className={isIncome ? 'on' : ''} onClick={() => setIsIncome(true)}>
                Received
              </button>
            </div>
            <div className="row">
              <Field label="Amount">
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="25" />
              </Field>
              <Field label="Category">
                <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="food, rent, salary" />
              </Field>
            </div>
          </>
        )}

        <Field label={kind === 'note' ? 'Note' : 'Notes (optional)'}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder={kind === 'trade' ? 'Setup, emotions, what you would repeat' : ''} />
        </Field>

        <div className="row">
          <Field label="Area">
            <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
              {active.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.icon} {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
          </Field>
        </div>

        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="btn primary">
            Save entry
          </button>
        </div>
      </form>
    </Sheet>
  )
}
