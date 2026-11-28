import { describe, expect, it } from 'vitest'
import { emptyState, starterState } from '../defaults'
import { appStateSchema } from '../schema'
import { AREA_TEMPLATES, buildSystem, defaultPicks, isOnboarded, type SetupChoices } from '../templates'

const choices = (over: Partial<SetupChoices> = {}): SetupChoices => ({
  name: '  Jeff ',
  currency: '$',
  weekStartsOn: 0,
  areas: ['fitness', 'finance'],
  customAreas: [],
  ...defaultPicks(['fitness', 'finance']),
  ...over,
})

describe('isOnboarded', () => {
  it('is false for a brand-new device and true once set up', () => {
    expect(isOnboarded(emptyState())).toBe(false)
    expect(isOnboarded({ ...emptyState(), settings: { ...emptyState().settings, onboardedAt: 1 } })).toBe(true)
  })
  it('treats accounts made before setup existed as set up', () => {
    expect(isOnboarded(starterState('2026-11-01'))).toBe(true)
  })
})

describe('buildSystem', () => {
  const built = buildSystem(emptyState(), choices(), '2026-11-28', 1234)

  it('creates the picked areas with all their suggestions by default', () => {
    expect(built.areas.map((a) => a.id)).toEqual(['fitness', 'finance'])
    const fitness = AREA_TEMPLATES.find((a) => a.id === 'fitness')!
    expect(built.routines.filter((r) => r.areaId === 'fitness')).toHaveLength(fitness.routines.length)
    expect(built.goals.every((g) => ['fitness', 'finance'].includes(g.areaId))).toBe(true)
  })

  it('saves name, currency and week start, and marks setup done', () => {
    expect(built.settings).toMatchObject({ name: 'Jeff', currency: '$', weekStartsOn: 0, onboardedAt: 1234 })
    expect(built.startedOn).toBe('2026-11-28')
    expect(isOnboarded(built)).toBe(true)
  })

  it('uses the chosen currency in money goals and rules', () => {
    expect(built.goals.find((g) => g.id === 'g-spend')?.unit).toBe('$')
    expect(built.rules.find((r) => r.id === 'fin-impulse')?.text).toBe('Wait 48h before any non-essential purchase over $100')
  })

  it('only includes what was picked, at the chosen targets', () => {
    const b = buildSystem(emptyState(), choices({ goals: { 'g-train': 3, 'g-save': 0 }, routines: ['fit-train'], rules: [] }), '2026-11-28', 1)
    expect(b.goals.map((g) => [g.id, g.target])).toEqual([['g-train', 3]])
    expect(b.routines.map((r) => r.id)).toEqual(['fit-train'])
    expect(b.rules).toEqual([])
  })

  it('adds areas the user typed, with unique ids', () => {
    const b = buildSystem(emptyState(), choices({ customAreas: ['Side business', 'side business', '  '] }), '2026-11-28', 1)
    const custom = b.areas.filter((a) => a.id.startsWith('custom-'))
    expect(custom.map((a) => a.id)).toEqual(['custom-side-business', 'custom-side-business-2'])
    expect(custom[0]!.name).toBe('Side business')
  })

  it('keeps anything already there and produces valid data', () => {
    const start = { ...starterState('2026-11-01'), logs: [] }
    const b = buildSystem(start, choices({ areas: ['fitness', 'mindset'], ...defaultPicks(['fitness', 'mindset']) }), '2026-11-28', 1)
    expect(b.areas.filter((a) => a.id === 'fitness')).toHaveLength(1)
    expect(b.areas.some((a) => a.id === 'mindset')).toBe(true)
    expect(b.startedOn).toBe('2026-11-01')
    expect(appStateSchema.safeParse(b).success).toBe(true)
  })
})
