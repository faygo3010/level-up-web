import { act, render, screen, waitFor } from '@testing-library/react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { starterState } from '../../../core/defaults'
import type { AppState } from '../../../core/types'
import { StoreProvider, useStore } from '../../store'
import { SyncProvider, useSync } from '../useSync'

type Row = { state: AppState; version: string } | null

/** Minimal in-memory imitation of the parts of supabase-js the app uses. */
function fakeSupabase(initial: Row, signedIn = true) {
  const db = { row: initial, writes: 0 }
  const session = signedIn ? { user: { id: 'user-1', email: 'me@example.com' } } : null
  const client = {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithOtp: vi.fn(async () => ({ error: null })),
      verifyOtp: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.row, error: null }) }) }),
      insert: async (r: { state: AppState; version: string }) => {
        if (db.row) return { error: { code: '23505' } }
        db.row = { state: r.state, version: r.version }
        db.writes++
        return { error: null }
      },
      update: (r: { state: AppState; version: string }) => ({
        eq: () => ({
          eq: (_col: string, base: string) => ({
            select: async () => {
              if (db.row?.version !== base) return { data: [], error: null }
              db.row = { state: r.state, version: r.version }
              db.writes++
              return { data: [{ version: r.version }], error: null }
            },
          }),
        }),
      }),
    }),
  }
  return { db, client: client as unknown as SupabaseClient }
}

function Probe() {
  const { state, dispatch } = useStore()
  const sync = useSync()
  return (
    <div>
      <span data-testid="status">{sync.status}</span>
      <span data-testid="currency">{state.settings.currency}</span>
      <button onClick={() => dispatch({ type: 'updateSettings', settings: { currency: '€' } })}>edit</button>
    </div>
  )
}

const renderWith = (client: SupabaseClient | null, initial: AppState) =>
  render(
    <StoreProvider initial={initial}>
      <SyncProvider supabase={client}>
        <Probe />
      </SyncProvider>
    </StoreProvider>,
  )

beforeEach(() => localStorage.clear())

describe('SyncProvider', () => {
  it('reports sync as off when Supabase is not configured', () => {
    renderWith(null, starterState('2026-11-24'))
    expect(screen.getByTestId('status').textContent).toBe('off')
  })

  it('reports signed out when there is no session', async () => {
    const { client } = fakeSupabase(null, false)
    renderWith(client, starterState('2026-11-24'))
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signedOut'))
  })

  it('uploads this device on first sign-in to an empty account', async () => {
    const { db, client } = fakeSupabase(null)
    renderWith(client, starterState('2026-11-24'))
    await waitFor(() => expect(db.writes).toBe(1))
    expect(db.row?.state.areas).toHaveLength(4)
  })

  it('pulls account data onto a new device, account winning conflicts', async () => {
    const account = { ...starterState('2026-11-01'), settings: { currency: '$', streakThreshold: 0.8, weekStartsOn: 1 as const } }
    const { client } = fakeSupabase({ state: account, version: 'v1' })
    renderWith(client, starterState('2026-11-24'))
    await waitFor(() => expect(screen.getByTestId('currency').textContent).toBe('$'))
  })

  it('pushes local edits after a short delay', async () => {
    const { db, client } = fakeSupabase(null)
    renderWith(client, starterState('2026-11-24'))
    await waitFor(() => expect(db.writes).toBe(1))
    await act(async () => screen.getByText('edit').click())
    await waitFor(() => expect(db.row?.state.settings.currency).toBe('€'), { timeout: 4000 })
  })

  it('never merges a previous account into a different one on a shared device', async () => {
    localStorage.setItem('levelup:owner', 'someone-else')
    const { db, client } = fakeSupabase(null)
    renderWith(client, { ...starterState('2026-11-24'), settings: { currency: '¥', streakThreshold: 0.8, weekStartsOn: 1 } })
    await waitFor(() => expect(db.writes).toBe(1))
    expect(db.row?.state.areas).toHaveLength(0)
    expect(db.row?.state.settings.currency).toBe('£')
    expect(localStorage.getItem('levelup:owner')).toBe('user-1')
  })
})
