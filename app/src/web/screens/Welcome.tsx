import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { SignIn } from '../components/AccountSection'
import { useSync } from '../sync/useSync'

const POINTS = [
  { icon: '✅', title: 'Daily checklist', text: 'Your routines and rules for work, fitness, trading and money, in one place.' },
  { icon: '🎯', title: 'Goals with progress bars', text: 'See at a glance whether you are on track this week.' },
  { icon: '📅', title: 'Calendar and journal', text: 'Every trade, workout and spend, with the reason behind it.' },
  { icon: '🤖', title: 'Your own AI coach', text: 'Connect Claude or ChatGPT to check in and update things by chat.' },
]

/** First screen on a new device: what the app is, then sign up or sign in. */
export function Welcome({ onGuest }: { onGuest: () => void }) {
  const sync = useSync()
  return (
    <VStack gap={6}>
      <VStack gap={2}>
        <Heading level={1} id="page-title">
          Build your system. Then follow it.
        </Heading>
        <Text color="secondary">Level Up turns how you want to live into a daily plan, and shows you how well you're sticking to it.</Text>
      </VStack>

      <VStack gap={4} as="ul" aria-label="What you get">
        {POINTS.map((p) => (
          <HStack key={p.title} gap={3} vAlign="start" as="li">
            <Text type="large" aria-hidden>
              {p.icon}
            </Text>
            <VStack gap={0.5}>
              <Text weight="semibold">{p.title}</Text>
              <Text color="secondary">{p.text}</Text>
            </VStack>
          </HStack>
        ))}
      </VStack>

      {sync.configured ? (
        <Card padding={4}>
          <VStack gap={3}>
            <Heading level={2}>Create your account or sign in</Heading>
            <Text color="secondary">Your system is saved to your account, so it's there on your phone and laptop.</Text>
            <SignIn intro={false} />
          </VStack>
        </Card>
      ) : (
        <Button variant="primary" size="lg" label="Get started" onClick={onGuest} />
      )}

      {sync.configured && (
        <Button variant="ghost" label="Try it without an account" onClick={onGuest} />
      )}
    </VStack>
  )
}
