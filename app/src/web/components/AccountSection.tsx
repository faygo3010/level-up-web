import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { HStack } from '@astryxdesign/core/HStack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VStack } from '@astryxdesign/core/VStack'
import { useState } from 'react'
import { useSync } from '../sync/useSync'
import { AiConnections } from './AiConnections'
import { Section } from './ui'

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
      <Text color="secondary">
        Optional. Sign in to back up your system and use it on your phone and laptop. Without an account, everything stays on this device.
      </Text>
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

const CONNECTOR_URL = import.meta.env.VITE_CONNECTOR_URL as string | undefined

function AiAppsSection() {
  const sync = useSync()
  if (!CONNECTOR_URL) return null
  return (
    <Section title="AI apps">
      {sync.status === 'signedOut' ? (
        <Text color="secondary">Sign in above to connect Claude, ChatGPT or another AI app to your Level Up.</Text>
      ) : (
        <AiConnections connectorUrl={CONNECTOR_URL} getToken={sync.getAccessToken} onRefresh={sync.syncNow} />
      )}
    </Section>
  )
}

function AccountCard() {
  const sync = useSync()

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
        <Button variant="ghost" label="Sign out (keeps a copy on this device)" onClick={() => void sync.signOut()} />
      </VStack>
    </Section>
  )
}

export function AccountSection() {
  return (
    <>
      <AccountCard />
      <AiAppsSection />
    </>
  )
}
