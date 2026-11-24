import type { Rule } from '../../core/types'
import { useStore } from '../store'
import { Dot } from './ui'

/** Kept / broken toggle for one playbook rule on one day. Tapping the active choice clears it. */
export function RuleCheck({ rule, color }: { rule: Rule; color: string }) {
  const { state, dispatch, today } = useStore()
  const current = state.ruleChecks[today]?.[rule.id]

  const set = (kept: boolean) =>
    dispatch({ type: 'setRuleCheck', date: today, ruleId: rule.id, kept: current === kept ? null : kept })

  return (
    <div className="rule">
      <Dot color={color} />
      <span className="rule-text">{rule.text}</span>
      <div className="seg" role="group" aria-label={`Did you keep: ${rule.text}`}>
        <button className={current === true ? 'on good' : ''} aria-pressed={current === true} onClick={() => set(true)}>
          Kept
        </button>
        <button className={current === false ? 'on bad' : ''} aria-pressed={current === false} onClick={() => set(false)}>
          Broke
        </button>
      </div>
    </div>
  )
}
