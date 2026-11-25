import { HStack } from '@astryxdesign/core/HStack'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { ToggleButton, ToggleButtonGroup } from '@astryxdesign/core/ToggleButton'
import { VStack } from '@astryxdesign/core/VStack'
import type { Area, Rule } from '../../core/types'
import { useStore } from '../store'
import { AreaTag } from './ui'

/** Kept / broken toggle for one playbook rule on one day. Pressing the active choice again clears it. */
export function RuleCheck({ rule, area }: { rule: Rule; area: Area | undefined }) {
  const { state, dispatch, today } = useStore()
  const current = state.ruleChecks[today]?.[rule.id]

  const value = current === true ? 'kept' : current === false ? 'broke' : null
  const onChange = (next: string | null) =>
    dispatch({ type: 'setRuleCheck', date: today, ruleId: rule.id, kept: next === null ? null : next === 'kept' })

  return (
    <VStack gap={1.5} paddingBlock={2}>
      <Text>{rule.text}</Text>
      <HStack justify="between" vAlign="center" gap={2}>
        <HStack gap={1}>
          <AreaTag area={area} />
          {current === true && <Token label="Kept" color="green" size="sm" />}
          {current === false && <Token label="Broken" color="red" size="sm" />}
        </HStack>
        <ToggleButtonGroup label={`Did you keep: ${rule.text}`} size="sm" type="single" value={value} onChange={onChange}>
          <ToggleButton value="kept" label="Kept" />
          <ToggleButton value="broke" label="Broke" />
        </ToggleButtonGroup>
      </HStack>
    </VStack>
  )
}
