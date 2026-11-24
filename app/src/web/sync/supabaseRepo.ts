import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { newId } from '../../core/ids'
import { appStateSchema } from '../../core/schema'
import type { PushResult, RemoteDoc, RemoteRepo } from '../../core/sync'
import type { AppState } from '../../core/types'

const TABLE = 'user_state'
const UNIQUE_VIOLATION = '23505'

let client: SupabaseClient | null | undefined

/** The Supabase client, or null when the app was built without sync configured. */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  client = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null
  return client
}

export class SyncError extends Error {}

/** RemoteRepo backed by the user's single row in public.user_state. */
export function supabaseRepo(supabase: SupabaseClient, userId: string): RemoteRepo {
  return {
    async pull(): Promise<RemoteDoc | null> {
      const { data, error } = await supabase.from(TABLE).select('state, version').eq('user_id', userId).maybeSingle()
      if (error) throw new SyncError("Couldn't reach the sync server.")
      if (!data) return null
      // Never trust stored data blindly: validate before it reaches the app.
      const parsed = appStateSchema.safeParse(data.state)
      if (!parsed.success) throw new SyncError('Synced data is damaged. Your local copy was kept.')
      return { state: parsed.data as AppState, version: String(data.version) }
    },

    async push(state: AppState, baseVersion: string | null): Promise<PushResult> {
      const version = newId()
      if (baseVersion === null) {
        const { error } = await supabase.from(TABLE).insert({ user_id: userId, state, version })
        if (error?.code === UNIQUE_VIOLATION) return { ok: false }
        if (error) throw new SyncError("Couldn't save to the sync server.")
        return { ok: true, version }
      }
      const { data, error } = await supabase
        .from(TABLE)
        .update({ state, version })
        .eq('user_id', userId)
        .eq('version', baseVersion)
        .select('version')
      if (error) throw new SyncError("Couldn't save to the sync server.")
      return data && data.length > 0 ? { ok: true, version } : { ok: false }
    },
  }
}
