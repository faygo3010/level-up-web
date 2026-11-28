import { act, fireEvent, render, screen } from '@testing-library/react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { emptyState, starterState } from '../../core/defaults'
import { today } from '../../core/dates'
import type { AppState } from '../../core/types'
import { App } from '../App'
import { StoreProvider } from '../store'
import { SyncProvider } from '../sync/useSync'

type Listener = (event: string, session: unknown) => void
const session = { user: { id: 'user-1', email: 'me@example.com' }, access_token: 't' }

/** A fake Supabase client: a signed-in session and a user_state table with an optional row. */
function fakeClient(row: { state: AppState; version: string } | null | 'error') {
  let listener: Listener = () => {}
  const result = row === 'error' ? { data: null, error: { message: 'offline' } } : { data: row, error: null }
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => result,
    insert: async () => ({ error: null }),
    update: () => ({ eq: () => ({ eq: () => ({ select: async () => ({ data: [{}], error: null }) }) }) }),
  }
  const client = {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: (cb: Listener) => {
        listener = cb
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
      signOut: async () => ({ error: null }),
    },
    from: () => chain,
  } as unknown as SupabaseClient
  return { client, emit: (event: string) => act(() => listener(event, session)) }
}

async function renderWith(client: SupabaseClient, initial: AppState = { ...emptyState(), startedOn: today() }) {
  window.location.hash = ''
  render(
    <StoreProvider initial={initial}>
      <SyncProvider supabase={client}>
        <App />
      </SyncProvider>
    </StoreProvider>,
  )
}

beforeEach(() => localStorage.clear())

describe('signing in on a new device', () => {
  it('takes a returning user straight to their dashboard, with no setup', async () => {
    const base = starterState(today())
    const remote = { ...base, settings: { ...base.settings, name: 'Jo', onboardedAt: 1 } }
    await renderWith(fakeClient({ state: remote, version: 'v1' }).client)
    expect(await screen.findByRole('heading', { level: 1, name: /, Jo\.$/ })).toBeInTheDocument()
    expect(screen.queryByText("Let's set up your system")).toBeNull()
  })

  it('takes a brand-new account to setup', async () => {
    await renderWith(fakeClient(null).client)
    expect(await screen.findByRole('heading', { level: 1, name: "Let's set up your system" })).toBeInTheDocument()
  })

  it('does not set up over an account it could not load unless asked', async () => {
    await renderWith(fakeClient('error').client)
    expect(await screen.findByRole('heading', { level: 1, name: "Couldn't load your account" })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: "I'm new here, set up anyway" }))
    expect(screen.getByRole('heading', { level: 1, name: "Let's set up your system" })).toBeInTheDocument()
  })
})

describe('password reset link', () => {
  it('keeps the new-password form up even for a set-up account', async () => {
    const { client, emit } = fakeClient({ state: starterState(today()), version: 'v1' })
    await renderWith(client, starterState(today()))
    await screen.findByRole('navigation', { name: 'Main' })
    await emit('PASSWORD_RECOVERY')
    expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
  })
})
