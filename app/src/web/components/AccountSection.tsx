import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Divider } from '@astryxdesign/core/Divider'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { HStack } from '@astryxdesign/core/HStack'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VStack } from '@astryxdesign/core/VStack'
import { useState } from 'react'
import { useSync, type OAuthProvider } from '../sync/useSync'
import { Section } from './ui'

function syncedLabel(at: number | null): string {
  if (at === null) return 'Not synced yet'
  const mins = Math.round((Date.now() - at) / 60000)
  return mins < 1 ? 'Synced just now' : `Synced ${mins} min ago`
}

/** The original passwordless option: a 6-digit code by email. */
function CodeSignIn() {
  const sync = useSync()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setBusy(true)
    setError('')
    const err = sent ? await sync.verifyCode(email, code) : await sync.sendCode(email)
    setBusy(false)
    if (err) return setError(err)
    if (!sent) setSent(true)
  }

  return (
    <VStack gap={3}>
      <FormLayout>
        <TextInput label="Email" type="email" value={email} isDisabled={sent} onChange={setEmail} placeholder="you@example.com" onEnter={submit} />
        {sent && <TextInput label="6-digit code from the email" value={code} onChange={setCode} placeholder="123456" onEnter={submit} />}
      </FormLayout>
      {error && <Banner status="error" title={error} />}
      <HStack gap={2} justify="end">
        {sent && (
          <Button
            variant="ghost"
            label="Use a different email"
            onClick={() => {
              setSent(false)
              setCode('')
            }}
          />
        )}
        <Button variant="primary" label={sent ? 'Sign in' : 'Email me a code'} isLoading={busy} onClick={() => void submit()} />
      </HStack>
    </VStack>
  )
}

function PasswordSignIn() {
  const sync = useSync()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<'in' | 'up' | 'reset' | null>(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const act = async (kind: 'in' | 'up' | 'reset') => {
    setBusy(kind)
    setError('')
    setInfo('')
    if (kind === 'in') {
      const err = await sync.signInWithPassword(email, password)
      if (err) setError(err)
    } else if (kind === 'up') {
      const r = await sync.signUpWithPassword(email, password)
      if (r.error) setError(r.error)
      if (r.info) setInfo(r.info)
    } else {
      const err = await sync.sendPasswordReset(email)
      if (err) setError(err)
      else setInfo('If that email has an account, a reset link is on its way.')
    }
    setBusy(null)
  }

  return (
    <VStack gap={3}>
      <FormLayout>
        <TextInput label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
        <TextInput label="Password" type="password" value={password} onChange={setPassword} description="At least 8 characters." onEnter={() => void act('in')} />
      </FormLayout>
      {error && <Banner status="error" title={error} />}
      {info && <Banner status="info" title={info} />}
      <HStack gap={2} justify="between" wrap="wrap">
        <Button variant="ghost" size="sm" label="Forgot password?" isLoading={busy === 'reset'} onClick={() => void act('reset')} />
        <HStack gap={2}>
          <Button variant="secondary" label="Create account" isLoading={busy === 'up'} onClick={() => void act('up')} />
          <Button variant="primary" label="Sign in" isLoading={busy === 'in'} onClick={() => void act('in')} />
        </HStack>
      </HStack>
    </VStack>
  )
}

/** Apple sign-in needs a paid Apple Developer account, so it's off until VITE_APPLE_SIGNIN=true. */
const appleEnabled = () => import.meta.env.VITE_APPLE_SIGNIN === 'true'

export function SignIn({ intro = true }: { intro?: boolean }) {
  const sync = useSync()
  const [method, setMethod] = useState<'password' | 'code'>('password')
  const [error, setError] = useState('')

  const provider = async (p: OAuthProvider) => {
    setError('')
    const err = await sync.signInWithProvider(p)
    if (err) setError(err)
  }

  return (
    <VStack gap={3}>
      {intro && (
        <Text color="secondary">
          Sign in to back up your system, sync your phone and laptop, and connect your AI coach. Without an account, everything stays on this device.
        </Text>
      )}
      <VStack gap={2} hAlign="stretch">
        {appleEnabled() && <Button variant="secondary" label="Continue with Apple" onClick={() => void provider('apple')} />}
        <Button variant="secondary" label="Continue with Google" onClick={() => void provider('google')} />
      </VStack>
      {error && <Banner status="error" title={error} />}
      <Divider />
      <SegmentedControl label="Sign in with email" value={method} onChange={(v) => setMethod(v as 'password' | 'code')} layout="fill" size="sm">
        <SegmentedControlItem value="password" label="Password" />
        <SegmentedControlItem value="code" label="Email code" />
      </SegmentedControl>
      {method === 'password' ? <PasswordSignIn /> : <CodeSignIn />}
    </VStack>
  )
}

/** Shown after opening a password-reset link. */
function NewPassword() {
  const sync = useSync()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Section title="Choose a new password">
      <VStack gap={3}>
        <TextInput label="New password" type="password" value={password} onChange={setPassword} description="At least 8 characters." />
        {error && <Banner status="error" title={error} />}
        <HStack justify="end">
          <Button
            variant="primary"
            label="Save password"
            isLoading={busy}
            onClick={async () => {
              setBusy(true)
              const err = await sync.updatePassword(password)
              setBusy(false)
              setError(err ?? '')
            }}
          />
        </HStack>
      </VStack>
    </Section>
  )
}

/**
 * Lets people who signed up with Google (or an email code) add a password, which
 * is what connected AI apps ask for when they sign in to Level Up.
 */
function SetPassword() {
  const sync = useSync()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  if (!open) return <Button variant="ghost" label="Set or change password" onClick={() => setOpen(true)} />
  return (
    <VStack gap={2}>
      <TextInput
        label="New password"
        type="password"
        value={password}
        onChange={setPassword}
        description="At least 8 characters. Use it with your email to sign in to Level Up from Claude or ChatGPT."
      />
      {message && <Banner status={message.ok ? 'success' : 'error'} title={message.text} />}
      <HStack justify="end" gap={2}>
        <Button variant="ghost" label="Cancel" onClick={() => setOpen(false)} />
        <Button
          variant="primary"
          label="Save password"
          isLoading={busy}
          onClick={async () => {
            setBusy(true)
            const err = await sync.updatePassword(password)
            setBusy(false)
            setMessage(err ? { ok: false, text: err } : { ok: true, text: 'Password saved.' })
            if (!err) setPassword('')
          }}
        />
      </HStack>
    </VStack>
  )
}

function AccountCard() {
  const sync = useSync()

  if (sync.recoveringPassword) return <NewPassword />

  if (!sync.configured) {
    return (
      <Section title="Account & sync">
        <Text color="secondary">Sync isn't set up on this copy of the app. Your data is saved on this device only.</Text>
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
      <VStack gap={2} hAlign="stretch">
        <Text color="secondary" role="status">
          Signed in as {sync.email}. {sync.status === 'syncing' ? 'Syncing…' : syncedLabel(sync.lastSynced)}
        </Text>
        {sync.error && <Banner status="error" title={sync.error} />}
        <Button variant="secondary" label="Sync now" onClick={sync.syncNow} isDisabled={sync.status === 'syncing'} />
        <SetPassword />
        <Button variant="ghost" label="Sign out (keeps a copy on this device)" onClick={() => void sync.signOut()} />
      </VStack>
    </Section>
  )
}

export function AccountSection() {
  return (
    <>
      <AccountCard />
    </>
  )
}
