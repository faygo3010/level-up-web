import { parseState, serializeState } from '../storage'
import { emptyState, starterState } from '../defaults'

describe('storage', () => {
  it('round-trips state through JSON', () => {
    const state = starterState('2026-11-24')
    const parsed = parseState(serializeState(state))
    expect(parsed).toEqual({ ok: true, state })
  })

  it('rejects invalid JSON', () => {
    expect(parseState('{nope')).toEqual({ ok: false, error: 'File is not valid JSON.' })
  })

  it('rejects JSON that is not a Level Up backup', () => {
    const result = parseState(JSON.stringify({ hello: 'world' }))
    expect(result.ok).toBe(false)
  })

  it('fills in missing settings from defaults', () => {
    const { settings: _settings, ...rest } = emptyState()
    const result = parseState(JSON.stringify(rest))
    expect(result.ok && result.state.settings).toEqual(emptyState().settings)
  })
})

describe('starterState', () => {
  it('records the start date', () => {
    expect(starterState('2026-11-24').startedOn).toBe('2026-11-24')
  })

  it('seeds the four core areas with a starter system', () => {
    const s = starterState('2026-11-24')
    expect(s.areas.map((a) => a.name)).toEqual(['Work', 'Fitness', 'Trading', 'Finance'])
    for (const area of s.areas) {
      expect(s.routines.some((r) => r.areaId === area.id)).toBe(true)
    }
    expect(s.rules.length).toBeGreaterThan(0)
    expect(s.goals.length).toBeGreaterThan(0)
  })
})
