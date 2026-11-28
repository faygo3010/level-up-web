import { DateInput } from '@astryxdesign/core/DateInput'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Selector } from '@astryxdesign/core/Selector'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useState } from 'react'
import { newId } from '../../core/ids'
import type { LogEntry, LogKind } from '../../core/types'
import { useAreas, useStore } from '../store'
import { FormShell } from './forms'

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

/** Astryx's DateInput uses a stricter template-literal type for YYYY-MM-DD; our DateKey is the same format. */
type IsoDate = `${number}${number}${number}${number}-${number}${number}-${number}${number}`
const iso = (d: string) => d as IsoDate

const finite = (n: number | undefined): number | null => (n !== undefined && Number.isFinite(n) ? n : null)

/** New journal entry. `date` pre-fills the day (e.g. from the calendar); future dates fall back to today. */
export function LogForm({ onClose, date: initialDate }: { onClose: () => void; date?: string }) {
  const { dispatch, today } = useStore()
  const { active } = useAreas()
  const [kind, setKind] = useState<LogKind>('trade')
  const [areaId, setAreaId] = useState(() => defaultArea('trade', active))
  const [date, setDate] = useState(() => (initialDate && initialDate <= today ? initialDate : today))
  const [text, setText] = useState('')
  const [symbol, setSymbol] = useState('')
  const [side, setSide] = useState<'long' | 'short'>('long')
  const [pnl, setPnl] = useState<number | undefined>()
  // No default: a losing off-plan trade must never be saved as on-plan by accident.
  const [followedPlan, setFollowedPlan] = useState<'yes' | 'no' | ''>('')
  const [activity, setActivity] = useState('')
  const [minutes, setMinutes] = useState<number | undefined>()
  const [amount, setAmount] = useState<number | undefined>()
  const [flow, setFlow] = useState<'spent' | 'received'>('spent')
  const [category, setCategory] = useState('')

  const pickKind = (k: string) => {
    const next = k as LogKind
    setKind(next)
    setAreaId(defaultArea(next, active))
  }

  const build = (): LogEntry | string => {
    if (!areaId) return 'Add an area first.'
    const base = { id: newId(), areaId, date: date > today ? today : date, text: text.trim().slice(0, 2000), createdAt: Date.now() }
    switch (kind) {
      case 'note':
        return base.text ? { ...base, kind } : 'Write something first.'
      case 'trade': {
        const p = finite(pnl)
        if (p === null) return 'Enter the P&L (negative for a loss).'
        if (followedPlan === '') return 'Say whether you followed your plan on this trade.'
        return { ...base, kind, trade: { symbol: symbol.trim().toUpperCase().slice(0, 20), side, pnl: p, followedPlan: followedPlan === 'yes' } }
      }
      case 'workout': {
        const m = finite(minutes)
        if (m === null || m < 0) return 'Enter how many minutes.'
        return { ...base, kind, workout: { activity: activity.trim().slice(0, 60) || 'Workout', minutes: m } }
      }
      case 'money': {
        const a = finite(amount)
        if (a === null || a === 0) return 'Enter an amount.'
        if (flow === 'spent' && !base.text) return 'Say what the money was spent on.'
        const signed = flow === 'received' ? Math.abs(a) : -Math.abs(a)
        return { ...base, kind, money: { amount: signed, category: category.trim().toLowerCase().slice(0, 40) || 'other' } }
      }
    }
  }

  const save = () => {
    const result = build()
    if (typeof result === 'string') return result
    dispatch({ type: 'addLog', entry: result })
    return null
  }

  return (
    <FormShell title="New journal entry" onClose={onClose} onSubmit={save}>
      <SegmentedControl label="Entry type" value={kind} onChange={pickKind} layout="fill">
        {KINDS.map((k) => (
          <SegmentedControlItem key={k.kind} value={k.kind} label={k.label} />
        ))}
      </SegmentedControl>

      {kind === 'trade' && (
        <>
          <TextInput label="Symbol" value={symbol} onChange={setSymbol} placeholder="ES, AAPL, BTC" />
          <Selector
            label="Side"
            value={side}
            onChange={(v) => setSide(v as 'long' | 'short')}
            options={[
              { value: 'long', label: 'Long' },
              { value: 'short', label: 'Short' },
            ]}
          />
          <NumberInput label="P&L" value={pnl} onChange={setPnl} placeholder="-120 or 250" />
          <SegmentedControl label="Did you follow your plan and rules?" value={followedPlan} onChange={(v) => setFollowedPlan(v as 'yes' | 'no')} layout="fill">
            <SegmentedControlItem value="yes" label="Followed plan" />
            <SegmentedControlItem value="no" label="Broke plan" />
          </SegmentedControl>
        </>
      )}

      {kind === 'workout' && (
        <>
          <TextInput label="Activity" value={activity} onChange={setActivity} placeholder="Run, lift, swim" />
          <NumberInput label="Minutes" value={minutes} onChange={setMinutes} placeholder="45" />
        </>
      )}

      {kind === 'money' && (
        <>
          <SegmentedControl label="Direction" value={flow} onChange={(v) => setFlow(v as 'spent' | 'received')} layout="fill">
            <SegmentedControlItem value="spent" label="Spent" />
            <SegmentedControlItem value="received" label="Received" />
          </SegmentedControl>
          <NumberInput label="Amount" value={amount} onChange={setAmount} placeholder="25" />
          <TextInput
            label={flow === 'spent' ? 'What was it for?' : 'What was it?'}
            isOptional={flow === 'received'}
            value={text}
            onChange={setText}
            placeholder={flow === 'spent' ? 'Lunch with a client, gym membership' : 'Salary, refund, sold bike'}
          />
          <TextInput label="Category" isOptional value={category} onChange={setCategory} placeholder="food, rent, salary" />
        </>
      )}

      {kind !== 'money' && <TextArea
        label={kind === 'note' ? 'Note' : 'Notes'}
        isOptional={kind !== 'note'}
        value={text}
        onChange={setText}
        rows={3}
        placeholder={kind === 'trade' ? 'Setup, emotions, what you would repeat' : ''}
      />}
      <Selector label="Area" value={areaId} onChange={setAreaId} options={active.map((a) => ({ value: a.id, label: `${a.icon} ${a.name}` }))} />
      <DateInput label="Date" value={iso(date)} max={iso(today)} onChange={(v) => setDate(v || today)} />
    </FormShell>
  )
}
