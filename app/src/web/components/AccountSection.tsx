import { useState, type FormEvent } from 'react'
import { useSync } from '../sync/useSync'
import { Field, Section } from './ui'

function syncedLabel(at: number | null): string {
  if (at === null) return 'Not synced yet'
  const mins = Math.round((Date.now() - at) / 60000)
  return mins < 1 ? 'Synced just now' : `Synced ${mins} min ago`
}

function SignIn() {
  const sync = useSync()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const err = sent ? await sync.verifyCode(email, code) : await sync.sendCode(email)
    setBusy(false)
    if (err) return setError(err)
    if (!sent) setSent(true)
  }

  return (
    <form className="form" onSubmit={submit}>
      <p className="muted small">
        Optional. Sign in to back up your system and use it on your phone and laptop. Without an account, everything stays on
        this device.
      </p>
      <Field label="Email">
        <input
          id="account-email"
          type="email"
          autoComplete="email"
          value={email}
          disabled={sent}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
      </Field>
      {sent && (
        <Field label="6-digit code from the email">
          <input
            id="account-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            autoFocus
            required
          />
        </Field>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        {sent && (
          <button type="button" className="btn ghost" onClick={() => (setSent(false), setCode(''))}>
            Use a different email
          </button>
        )}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Working…' : sent ? 'Sign in' : 'Email me a code'}
        </button>
      </div>
    </form>
  )
}

export function AccountSection() {
  const sync = useSync()

  if (!sync.configured) {
    return (
      <Section title="Account & sync">
        <p className="muted small">Sync isn't set up on this copy of the app. Your data is saved on this device only.</p>
      </Section>
    )
  }

  if (sync.status === 'signedOut') {
    return (
      <Section title="Account & sync">
        <SignIn />
      </Section>
    )
  }

  return (
    <Section title="Account & sync">
      <div className="stack">
        <p className="muted small" role="status">
          Signed in as <strong>{sync.email}</strong>. {sync.status === 'syncing' ? 'Syncing…' : syncedLabel(sync.lastSynced)}
        </p>
        {sync.error && (
          <p className="error" role="alert">
            {sync.error}
          </p>
        )}
        <button className="btn" onClick={sync.syncNow} disabled={sync.status === 'syncing'}>
          Sync now
        </button>
        <button className="btn ghost" onClick={() => void sync.signOut()}>
          Sign out (keeps a copy on this device)
        </button>
      </div>
    </Section>
  )
}
