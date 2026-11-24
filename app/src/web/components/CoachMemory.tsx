import { List, ListItem } from '@astryxdesign/core/List'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { useStore } from '../store'
import { ConfirmButton, Empty, Section } from './ui'

const when = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * What connected AI apps have saved about you. Always visible and deletable:
 * memory you can't inspect isn't something you control.
 */
export function CoachMemory() {
  const { state, dispatch } = useStore()
  const names = new Map(state.areas.map((a) => [a.id, a.name]))

  return (
    <Section title="What your AI coach remembers">
      <VStack gap={2}>
        <Text color="secondary">
          Notes connected AI apps saved so any of them can pick up where the last left off. They sync with your account. Delete anything you
          don't want kept.
        </Text>
        {state.memories.length === 0 ? (
          <Empty>Nothing saved yet.</Empty>
        ) : (
          <List hasDividers>
            {state.memories.map((m) => (
              <ListItem
                key={m.id}
                label={m.text}
                description={[m.areaId && names.get(m.areaId), `saved by ${m.source}`, when(m.createdAt)].filter(Boolean).join(' · ')}
                endContent={<ConfirmButton size="sm" label="Delete" confirmLabel="Delete?" onConfirm={() => dispatch({ type: 'removeMemory', id: m.id })} />}
              />
            ))}
          </List>
        )}
      </VStack>
    </Section>
  )
}
