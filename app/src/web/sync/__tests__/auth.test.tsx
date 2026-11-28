import { act, fireEvent, render, screen } from '@testing-library/react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { starterState } from '../../../core/defaults'
import { AccountSection } from '../../components/AccountSection'
import { StoreProvider } from '../../store'
import { SyncProvider } from '../useSync'

type Listener = (event: string, session: unknown) => void

/** Minimal fake of supabase-js auth for the sign-in screen. */
function fakeAuth(overrides: Record<string, unknown> = {}) {
  let listener: Listener = () => {}
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: null } })),
    onAuthStateChange: vi.fn((cb: Listener) => {
      listener = cb
      return { data: { subscription: { unsubscribe: () => {} } } }
    }),
    signInWithOAuth: vi.fn(async () => ({ error: null })),
    signInWithPassword: vi.fn(async () => ({ error: null })),
    signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ error: null })),
    updateUser: vi.fn(async () => ({ error: null })),
    signInWithOtp: vi.fn(async () => ({ error: null })),
    verifyOtp: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    ...overrides,
  }
  return { auth, client: { auth } as unknown as SupabaseClient, emit: (e: string) => act(() => listener(e, null)) }
}

const renderAccount = (client: SupabaseClient) =>
  render(
    <StoreProvider initial={starterState('2026-11-24')}>
      <SyncProvider supabase={client}>
        <AccountSection />
      </SyncProvider>
    </StoreProvider>,
  )

const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const click = async (name: string) => act(async () => fireEvent.click(screen.getByRole('button', { name })))

describe('sign-in options', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('hides Apple until it is switched on', () => {
    renderAccount(fakeAuth().client)
    expect(screen.queryByRole('button', { name: 'Continue with Apple' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
  })

  it('starts Apple and Google sign-in and returns to this app', async () => {
    vi.stubEnv('VITE_APPLE_SIGNIN', 'true')
    const { auth, client } = fakeAuth()
    renderAccount(client)
    await click('Continue with Apple')
    await click('Continue with Google')
    expect(auth.signInWithOAuth).toHaveBeenNthCalledWith(1, { provider: 'apple', options: { redirectTo: `${window.location.origin}/` } })
    expect(auth.signInWithOAuth).toHaveBeenNthCalledWith(2, { provider: 'google', options: { redirectTo: `${window.location.origin}/` } })
  })

  it('signs in with email and password, with a generic error on failure', async () => {
    const { auth, client } = fakeAuth({ signInWithPassword: vi.fn(async () => ({ error: { message: 'Invalid login credentials' } })) })
    renderAccount(client)
    type(/^Email/, 'Me@Example.com ')
    type(/^Password/, 'hunter2hunter2')
    await click('Sign in')
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'me@example.com', password: 'hunter2hunter2' })
    expect(await screen.findByText('Email or password is incorrect.')).toBeInTheDocument()
  })

  it('creates an account, enforcing a minimum password length', async () => {
    const { auth, client } = fakeAuth()
    renderAccount(client)
    type(/^Email/, 'me@example.com')
    type(/^Password/, 'short')
    await click('Create account')
    expect(await screen.findByText('Use at least 8 characters.')).toBeInTheDocument()
    expect(auth.signUp).not.toHaveBeenCalled()
    type(/^Password/, 'long-enough-1')
    await click('Create account')
    expect(auth.signUp).toHaveBeenCalledWith({ email: 'me@example.com', password: 'long-enough-1', options: { emailRedirectTo: `${window.location.origin}/` } })
    expect(await screen.findByText(/Check your email to confirm/)).toBeInTheDocument()
  })

  it('sends a reset link without revealing whether the account exists', async () => {
    const { auth, client } = fakeAuth()
    renderAccount(client)
    type(/^Email/, 'me@example.com')
    await click('Forgot password?')
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('me@example.com', { redirectTo: `${window.location.origin}/` })
    expect(await screen.findByText(/If that email has an account/)).toBeInTheDocument()
  })

  it('asks for a new password after opening a reset link', async () => {
    const { auth, client, emit } = fakeAuth()
    renderAccount(client)
    await emit('PASSWORD_RECOVERY')
    expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
    type(/^New password/, 'brand-new-pass')
    await click('Save password')
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'brand-new-pass' })
    expect(screen.queryByRole('heading', { name: 'Choose a new password' })).not.toBeInTheDocument()
  })

  it('keeps the email-code option', async () => {
    const { auth, client } = fakeAuth()
    renderAccount(client)
    fireEvent.click(screen.getByRole('radio', { name: 'Email code' }))
    type(/^Email/, 'me@example.com')
    await click('Email me a code')
    expect(auth.signInWithOtp).toHaveBeenCalled()
  })
})
