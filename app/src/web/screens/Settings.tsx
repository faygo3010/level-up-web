import { useRef, useState, type ChangeEvent } from 'react'
import { emptyState, starterState } from '../../core/defaults'
import { parseState, serializeState } from '../../core/storage'
import type { AppState } from '../../core/types'
import { ConfirmButton, Field, Section } from '../components/ui'
import { useStore } from '../store'

const MAX_IMPORT_BYTES = 10 * 1024 * 1024

function download(filename: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function Settings() {
  const { state, dispatch, today, saveFailed } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const { settings } = state

  const [pending, setPending] = useState<AppState | null>(null)

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_IMPORT_BYTES) return setMessage('That file is too large to be a Level Up backup.')
    const result = parseState(await file.text())
    if (!result.ok) return setMessage(result.error)
    setPending(result.state)
    setMessage('Backup checked. Tap "Replace all data" to restore it.')
  }

  const replace = (next: AppState, note: string) => {
    dispatch({ type: 'replace', state: next })
    setPending(null)
    setMessage(note)
  }

  const copyBackup = async () => {
    try {
      await navigator.clipboard.writeText(serializeState(state))
      setMessage('Backup copied. Paste it into a note or file to keep it.')
    } catch {
      setMessage("Couldn't copy here. Use Export backup instead.")
    }
  }

  return (
    <div className="screen">
      <header className="hero-head">
        <h1>Settings</h1>
        <p className="sub">Everything stays on this device. No account, no cloud.</p>
      </header>

      {saveFailed && (
        <p className="error" role="alert">
          Couldn't save to this browser's storage. Export a backup so you don't lose anything.
        </p>
      )}

      <Section title="Preferences">
        <div className="form">
          <Field label="Currency symbol">
            <input
              value={settings.currency}
              maxLength={4}
              onChange={(e) => e.target.value.trim() && dispatch({ type: 'updateSettings', settings: { currency: e.target.value.trim() } })}
            />
          </Field>
          <Field label="Week starts on">
            <select
              value={settings.weekStartsOn}
              onChange={(e) => dispatch({ type: 'updateSettings', settings: { weekStartsOn: e.target.value === '0' ? 0 : 1 } })}
            >
              <option value={1}>Monday</option>
              <option value={0}>Sunday</option>
            </select>
          </Field>
          <Field label={`A day counts for your streak at ${Math.round(settings.streakThreshold * 100)}%`}>
            <input
              type="range"
              min={50}
              max={100}
              step={5}
              value={Math.round(settings.streakThreshold * 100)}
              onChange={(e) => dispatch({ type: 'updateSettings', settings: { streakThreshold: Number(e.target.value) / 100 } })}
            />
          </Field>
        </div>
      </Section>

      <Section title="Your data">
        <div className="stack">
          <button className="btn" onClick={() => download(`levelup-backup-${today}.json`, serializeState(state))}>
            Export backup (JSON)
          </button>
          <button className="btn" onClick={copyBackup}>
            Copy backup to clipboard
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import backup
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} data-testid="import" />
          {pending && (
            <ConfirmButton label="Replace all data" confirmLabel="Tap again to replace" onConfirm={() => replace(pending, 'Backup restored.')} />
          )}
          <ConfirmButton
            className="btn ghost"
            label="Load starter system"
            confirmLabel="Tap again: replaces everything"
            onConfirm={() => replace(starterState(today), 'Starter system loaded.')}
          />
          <ConfirmButton label="Delete all data" confirmLabel="Tap again to delete everything" onConfirm={() => replace({ ...emptyState(), startedOn: today }, 'All data cleared.')} />
        </div>
        {message && <p className="muted" role="status">{message}</p>}
      </Section>
    </div>
  )
}
