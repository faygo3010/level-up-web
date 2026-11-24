import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { z } from 'zod'
import { emptyState } from '../../core/defaults'
import { mergeStates } from '../../core/merge'
import { NEVER_SYNCED, syncOnce, type RemoteRepo, type SyncMeta } from '../../core/sync'
import type { AppState } from '../../core/types'
import { useStore } from '../store'
import { getSupabase, supabaseRepo, SyncError } from './supabaseRepo'

const META_KEY = 'levelup:sync'
const OWNER_KEY = 'levelup:owner'
const PUSH_DELAY_MS = 2000
/** Pull often while the app is open so changes made from an AI chat show up quickly. */
const POLL_MS = 60 * 1000

export type SyncStatus = 'off' | 'signedOut' | 'idle' | 'syncing' | 'error'

interface SyncApi {
  readonly configured: boolean
  readonly status: SyncStatus
  readonly email: string | null
  readonly lastSynced: number | null
  readonly error: string | null
  sendCode(email: string): Promise<string | null>
  verifyCode(email: string, code: string): Promise<string | null>
  signOut(): Promise<void>
  syncNow(): void
  /** Current app session token, for calling the connector's API. */
  getAccessToken(): Promise<string | null>
}

const SyncContext = createContext<SyncApi | null>(null)

export const emailSchema = z.string().trim().toLowerCase().email().max(254)
export const codeSchema = z.string().trim().regex(/^\d{6,10}$/)

const metaSchema = z.object({ baseVersion: z.string().nullable(), dirty: z.boolean() })

function readMeta(): SyncMeta {
  try {
    const parsed = metaSchema.safeParse(JSON.parse(localStorage.getItem(META_KEY) ?? 'null'))
    return parsed.success ? parsed.data : NEVER_SYNCED
  } catch {
    return NEVER_SYNCED
  }
}

function writeMeta(meta: SyncMeta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta))
  } catch {
    // Storage blocked: sync still works for this session.
  }
}

function readOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY)
  } catch {
    return null
  }
}

function writeOwner(userId: string | null) {
  try {
    if (userId) localStorage.setItem(OWNER_KEY, userId)
    else localStorage.removeItem(OWNER_KEY)
  } catch {
    // ignore
  }
}

function useSession(supabase: SupabaseClient | null): Session | null {
  const [session, setSession] = useState<Session | null>(null)
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [supabase])
  return session
}

/** Owns sign-in and keeps the store in sync with the account in the background. */
export function SyncProvider({ children, supabase = getSupabase() }: { children: ReactNode; supabase?: SupabaseClient | null }) {
  const { state, dispatch, today } = useStore()
  const session = useSession(supabase)
  const userId = session?.user.id ?? null
  const repo = useMemo<RemoteRepo | null>(() => (supabase && userId ? supabaseRepo(supabase, userId) : null), [supabase, userId])

  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSynced, setLastSynced] = useState<number | null>(null)

  const meta = useRef<SyncMeta>(readMeta())
  const latest = useRef<AppState>(state)
  /** The state most recently written by sync itself, so we don't mark it as a local edit. */
  const fromSync = useRef<AppState | null>(null)
  const inFlight = useRef(false)

  const run = useCallback(async () => {
    if (!repo || inFlight.current) return
    inFlight.current = true
    setSyncing(true)
    try {
      // A different account signed in on this device: never mix its data with the
      // previous person's. Start from the account's copy instead.
      const switchedAccount = readOwner() !== null && readOwner() !== userId
      if (switchedAccount) meta.current = NEVER_SYNCED
      const sent = switchedAccount ? { ...emptyState(), startedOn: today } : latest.current
      const result = await syncOnce(sent, meta.current, repo)
      writeOwner(userId)

      // If the user edited while we were syncing, fold those edits in and push again.
      const editedMeanwhile = !switchedAccount && latest.current !== sent
      meta.current = { ...result.meta, dirty: result.meta.dirty || editedMeanwhile }
      writeMeta(meta.current)
      if (result.changed || switchedAccount) {
        const next = editedMeanwhile ? mergeStates(latest.current, result.state) : result.state
        fromSync.current = editedMeanwhile ? null : next
        dispatch({ type: 'replace', state: next })
      }
      setError(result.error ?? null)
      if (!result.error) setLastSynced(Date.now())
    } catch (e) {
      setError(e instanceof SyncError ? e.message : 'Sync failed. Your data is safe on this device.')
    } finally {
      inFlight.current = false
      setSyncing(false)
    }
  }, [repo, dispatch, userId, today])

  // Track local edits and push them shortly after they happen.
  useEffect(() => {
    latest.current = state
    if (state === fromSync.current) return
    if (!meta.current.dirty) {
      meta.current = { ...meta.current, dirty: true }
      writeMeta(meta.current)
    }
    if (!repo) return
    const id = window.setTimeout(run, PUSH_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [state, repo, run])

  // Sync on sign-in, when the app comes back to the foreground, and periodically.
  useEffect(() => {
    if (!repo) return
    void run()
    const onVisible = () => document.visibilityState === 'visible' && void run()
    document.addEventListener('visibilitychange', onVisible)
    const id = window.setInterval(() => document.visibilityState === 'visible' && void run(), POLL_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(id)
    }
  }, [repo, run])

  const api = useMemo<SyncApi>(() => {
    const status: SyncStatus = !supabase ? 'off' : !userId ? 'signedOut' : syncing ? 'syncing' : error ? 'error' : 'idle'
    return {
      configured: supabase !== null,
      status,
      email: session?.user.email ?? null,
      lastSynced,
      error,
      async sendCode(raw) {
        const email = emailSchema.safeParse(raw)
        if (!email.success) return 'Enter a valid email address.'
        if (!supabase) return 'Sync is not set up on this build.'
        const { error: e } = await supabase.auth.signInWithOtp({ email: email.data, options: { shouldCreateUser: true } })
        return e ? "Couldn't send the code. Wait a minute and try again." : null
      },
      async verifyCode(rawEmail, rawCode) {
        const email = emailSchema.safeParse(rawEmail)
        const code = codeSchema.safeParse(rawCode)
        if (!email.success || !code.success) return 'Enter the code from the email.'
        if (!supabase) return 'Sync is not set up on this build.'
        const { error: e } = await supabase.auth.verifyOtp({ email: email.data, token: code.data, type: 'email' })
        return e ? 'That code is wrong or expired. Request a new one.' : null
      },
      async signOut() {
        await supabase?.auth.signOut()
        meta.current = { ...NEVER_SYNCED, dirty: true }
        writeMeta(meta.current)
        setLastSynced(null)
        setError(null)
      },
      syncNow: () => void run(),
      async getAccessToken() {
        const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } }
        return data.session?.access_token ?? null
      },
    }
  }, [supabase, userId, session, syncing, error, lastSynced, run])

  return <SyncContext.Provider value={api}>{children}</SyncContext.Provider>
}

export function useSync(): SyncApi {
  const api = useContext(SyncContext)
  if (!api) throw new Error('useSync must be used inside <SyncProvider>')
  return api
}
