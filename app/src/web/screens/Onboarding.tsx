import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Divider } from '@astryxdesign/core/Divider'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Selector } from '@astryxdesign/core/Selector'
import { StackItem } from '@astryxdesign/core/Stack'
import { Step, Stepper } from '@astryxdesign/core/Stepper'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VStack } from '@astryxdesign/core/VStack'
import { useState } from 'react'
import { describeDays } from '../../core/format'
import { AREA_TEMPLATES, CURRENCIES, buildSystem, defaultPicks, withCurrency, type AreaTemplate, type SetupChoices } from '../../core/templates'
import { focusPageTitle } from '../components/ui'
import { useStore } from '../store'

const STEPS = ['About you', 'Areas', 'Goals', 'Daily system'] as const

const PERIOD: Record<string, string> = { daily: 'a day', weekly: 'a week', monthly: 'a month', yearly: 'a year' }
const TRACKS: Record<string, string> = {
  spending: 'counts spending you log',
  income: 'counts money in you log',
  workouts: 'counts workouts you log',
  workoutMinutes: 'counts workout minutes you log',
  trades: 'counts trades you log',
  tradePnl: 'adds up the P&L of trades you log',
}

const toggle = (list: readonly string[], id: string, on: boolean): string[] => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id))

/** Can the user move on from this step? Returns the problem, or null. */
export function stepProblem(step: number, c: SetupChoices): string | null {
  if (step === 1 && c.areas.length + c.customAreas.length === 0) return 'Pick at least one area to work on.'
  return null
}

/** First-run setup: a few questions, then the user's own system is built from their answers. */
export function Onboarding({ onDone }: { onDone?: () => void }) {
  const { state, dispatch, today } = useStore()
  const [step, setStep] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
  const [custom, setCustom] = useState('')
  const [c, setC] = useState<SetupChoices>(() => ({
    name: state.settings.name ?? '',
    currency: state.settings.currency,
    weekStartsOn: state.settings.weekStartsOn,
    areas: [],
    customAreas: [],
    goals: {},
    routines: [],
    rules: [],
  }))
  const picked = AREA_TEMPLATES.filter((a) => c.areas.includes(a.id))
  const set = (patch: Partial<SetupChoices>) => setC((prev) => ({ ...prev, ...patch }))

  const pickArea = (id: string, on: boolean) =>
    setC((prev) => {
      // Turning an area on also turns on its suggestions; turning it off removes them.
      const picks = defaultPicks([id])
      const areas = toggle(prev.areas, id, on)
      const goals = { ...prev.goals }
      for (const g of Object.keys(picks.goals)) {
        if (on) goals[g] = picks.goals[g]!
        else delete goals[g]
      }
      const sub = (list: readonly string[], ids: readonly string[]) => (on ? [...new Set([...list, ...ids])] : list.filter((x) => !ids.includes(x)))
      return { ...prev, areas, goals, routines: sub(prev.routines, picks.routines), rules: sub(prev.rules, picks.rules) }
    })

  const addCustom = () => {
    const name = custom.trim()
    if (!name || c.customAreas.some((x) => x.toLowerCase() === name.toLowerCase())) return
    set({ customAreas: [...c.customAreas, name] })
    setCustom('')
  }

  const go = (next: number) => {
    if (next > step) {
      const p = stepProblem(step, c)
      setProblem(p)
      if (p) return
    }
    setProblem(null)
    setStep(next)
    window.scrollTo?.({ top: 0 })
    requestAnimationFrame(focusPageTitle)
  }

  /** Work, fitness, trading and finance with every suggestion, for people who'd rather tweak than choose. */
  const useExample = () => {
    const core = ['work', 'fitness', 'trading', 'finance']
    dispatch({ type: 'replace', state: buildSystem(state, { ...c, areas: core, customAreas: [], ...defaultPicks(core) }, today, Date.now()) })
    onDone?.()
  }

  const finish = () => {
    dispatch({ type: 'replace', state: buildSystem(state, c, today, Date.now()) })
    onDone?.()
  }

  return (
    <VStack gap={5}>
      <Stepper activeStep={step} label="Setup progress" horizontalOptions={{ minimumStepWidth: 72, collapsedVariant: 'withLabel' }}>
        {STEPS.map((s, i) => (
          <Step key={s} step={i} label={s} />
        ))}
      </Stepper>

      {step === 0 && (
        <VStack gap={4}>
          <StepTitle title="Let's set up your system" subtitle="A few quick questions. You can change everything later." />
          <TextInput label="What should we call you?" value={c.name} onChange={(name) => set({ name })} placeholder="Your first name" isOptional />
          <Selector label="Currency" value={c.currency} onChange={(currency) => set({ currency })} options={CURRENCIES.map((x) => ({ value: x, label: x }))} />
          <SegmentedControl label="Your week starts on" value={String(c.weekStartsOn)} onChange={(v) => set({ weekStartsOn: v === '0' ? 0 : 1 })} layout="fill">
            <SegmentedControlItem value="1" label="Monday" />
            <SegmentedControlItem value="0" label="Sunday" />
          </SegmentedControl>
          <Button variant="ghost" label="Skip and use an example system" onClick={useExample} />
        </VStack>
      )}

      {step === 1 && (
        <VStack gap={4}>
          <StepTitle title="What do you want to work on?" subtitle="Pick the parts of your life you want a system for." />
          <VStack gap={3}>
            {AREA_TEMPLATES.map((a) => (
              <CheckboxInput key={a.id} label={`${a.icon} ${a.name}`} description={a.blurb} value={c.areas.includes(a.id)} onChange={(on) => pickArea(a.id, on)} />
            ))}
            {c.customAreas.map((name) => (
              <CheckboxInput key={name} label={`⭐ ${name}`} description="Your own area" value onChange={() => set({ customAreas: c.customAreas.filter((x) => x !== name) })} />
            ))}
          </VStack>
          <HStack gap={2} vAlign="end">
            <StackItem size="fill">
              <TextInput label="Add your own" value={custom} onChange={setCustom} placeholder="Side business, family, music" isOptional />
            </StackItem>
            <Button variant="secondary" label="Add area" onClick={addCustom} />
          </HStack>
        </VStack>
      )}

      {step === 2 && (
        <VStack gap={5}>
          <StepTitle title="Choose your goals" subtitle="Each goal gets a progress bar. Set targets you'd be proud to hit." />
          {picked.length === 0 && <Text color="secondary">Your own areas start empty. Add goals to them any time in Areas.</Text>}
          {picked.map((a) => (
            <AreaBlock key={a.id} area={a}>
              {a.goals.map((g) => {
                const on = c.goals[g.id] !== undefined
                const unit = withCurrency(g.unit, c.currency)
                const hint = [`${g.direction === 'atMost' ? 'At most' : 'At least'} this much ${PERIOD[g.period]}`, g.tracks && TRACKS[g.tracks]].filter(Boolean).join(', ')
                return (
                  <VStack key={g.id} gap={2}>
                    <CheckboxInput
                      label={g.title}
                      description={hint}
                      value={on}
                      onChange={(next) => {
                        const goals = { ...c.goals }
                        if (next) goals[g.id] = g.target
                        else delete goals[g.id]
                        set({ goals })
                      }}
                    />
                    {on && (
                      <NumberInput
                        label={`Target for ${g.title} (${unit})`}
                        value={c.goals[g.id]}
                        min={0}
                        onChange={(v) => set({ goals: { ...c.goals, [g.id]: v } })}
                      />
                    )}
                  </VStack>
                )
              })}
            </AreaBlock>
          ))}
        </VStack>
      )}

      {step === 3 && (
        <VStack gap={5}>
          <StepTitle title="Your daily system" subtitle="Routines go on your daily checklist. Rules are what you check yourself against." />
          {picked.length === 0 && <Text color="secondary">Your own areas start empty. Add routines and rules to them any time in Areas.</Text>}
          {picked.map((a) => (
            <AreaBlock key={a.id} area={a}>
              {a.routines.map((r) => (
                <CheckboxInput
                  key={r.id}
                  label={r.title}
                  description={`Routine · ${describeDays(r.days)}`}
                  value={c.routines.includes(r.id)}
                  onChange={(on) => set({ routines: toggle(c.routines, r.id, on) })}
                />
              ))}
              {a.rules.map((r) => (
                <CheckboxInput
                  key={r.id}
                  label={withCurrency(r.text, c.currency)}
                  description="Rule"
                  value={c.rules.includes(r.id)}
                  onChange={(on) => set({ rules: toggle(c.rules, r.id, on) })}
                />
              ))}
            </AreaBlock>
          ))}
        </VStack>
      )}

      {problem && <Banner status="error" title={problem} />}

      <Divider />
      <HStack justify="between" gap={2}>
        {step > 0 ? <Button variant="ghost" label="Back" onClick={() => go(step - 1)} /> : <Text color="secondary">Step 1 of {STEPS.length}</Text>}
        {step < STEPS.length - 1 ? (
          <Button variant="primary" label="Next" onClick={() => go(step + 1)} />
        ) : (
          <Button variant="primary" label="Finish setup" onClick={finish} />
        )}
      </HStack>
    </VStack>
  )
}

function StepTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <VStack gap={1}>
      <Heading level={1} id="page-title">
        {title}
      </Heading>
      <Text color="secondary">{subtitle}</Text>
    </VStack>
  )
}

function AreaBlock({ area, children }: { area: AreaTemplate; children: React.ReactNode }) {
  return (
    <VStack gap={3} as="section">
      <Heading level={2}>
        {area.icon} {area.name}
      </Heading>
      {children}
    </VStack>
  )
}
