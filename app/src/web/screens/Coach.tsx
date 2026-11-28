import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { List, ListItem } from '@astryxdesign/core/List'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { AiConnections } from '../components/AiConnections'
import { CoachMemory } from '../components/CoachMemory'
import { PageHeader, Section } from '../components/ui'
import { useSync } from '../sync/useSync'

const CONNECTOR_URL = import.meta.env.VITE_CONNECTOR_URL as string | undefined

/** Step-by-step setup for each chat app. Menu names change over time, so keep these short. */
export const CONNECT_STEPS: { app: string; steps: string[] }[] = [
  {
    app: 'Claude',
    steps: [
      'Open Claude (web, desktop or mobile) and go to Settings → Connectors.',
      'Choose "Add custom connector" and paste the Level Up URL below.',
      'Sign in with your Level Up account and tap Allow.',
      'Ask: "What\'s on my Level Up today?"',
    ],
  },
  {
    app: 'ChatGPT',
    steps: [
      'Open ChatGPT and go to Settings → Connectors (developer mode may need switching on).',
      'Create a connector and paste the Level Up URL below.',
      'Sign in with your Level Up account and tap Allow.',
      'Ask: "Log a trade: NQ short, +£220, followed my plan."',
    ],
  },
]

/**
 * The AI coach runs inside the user's own Claude or ChatGPT (their subscription
 * pays for it). It connects to their Level Up account through the connector and
 * can only ever see and change that one account.
 */
export function Coach() {
  const sync = useSync()
  const signedIn = sync.status !== 'signedOut' && sync.status !== 'off'

  return (
    <VStack gap={6}>
      <PageHeader
        title="Coach"
        subtitle="Use your own Claude or ChatGPT as your coach. It sees your schedule, ticks things off, logs trades and updates goals, and only ever sees your account."
      />

      {!CONNECTOR_URL && <Banner status="info" title="The AI connector isn't switched on for this copy of the app yet." />}
      {CONNECTOR_URL && !signedIn && (
        <Banner
          status="warning"
          title="Sign in first"
          description="Your coach connects to your Level Up account, so sign in (Apple, Google or email) to set it up."
          endContent={<Button size="sm" variant="secondary" label="Sign in" onClick={() => (window.location.hash = 'prefs')} />}
        />
      )}

      {CONNECT_STEPS.map(({ app, steps }) => (
        <Section key={app} title={`Connect ${app}`}>
          <List listStyle="decimal" density="compact">
            {steps.map((s) => (
              <ListItem key={s} label={s} />
            ))}
          </List>
        </Section>
      ))}

      {CONNECTOR_URL && signedIn && (
        <Section title="Your connection">
          <AiConnections connectorUrl={CONNECTOR_URL} getToken={sync.getAccessToken} onRefresh={sync.syncNow} />
        </Section>
      )}

      <CoachMemory />

      <Text type="supporting" color="secondary">
        Your AI app's own subscription covers the chat. Level Up stores your data and the notes your coach saves; you can disconnect any app or delete any note
        at any time.
      </Text>
    </VStack>
  )
}
