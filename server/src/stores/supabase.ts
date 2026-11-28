import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { appStateSchema } from '../../../app/src/core/schema'
import type { PushResult, RemoteRepo } from '../../../app/src/core/sync'
import type { AppState } from '../../../app/src/core/types'
import type { ActivityEntry, AuthorizationCode, Connection, PendingAuthorization, Stores, TokenRecord } from './types'

/**
 * Production stores backed by Supabase. Uses the service-role key, which
 * bypasses row-level security, so every query here filters by user_id
 * explicitly. The key must only ever live in the server's environment.
 */

const iso = (ms: number) => new Date(ms).toISOString()
const ms = (s: string | null) => (s ? Date.parse(s) : null)

function check<T>(r: { data: T; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`Database error while ${what}: ${r.error.message}`)
  return r.data
}

function oauthStore(db: SupabaseClient): Stores['oauth'] {
  return {
    async getClient(id) {
      const r = await db.from('oauth_clients').select('info').eq('client_id', id).maybeSingle()
      return (check(r, 'loading client') as { info: OAuthClientInformationFull } | null)?.info
    },
    async saveClient(c) {
      check(await db.from('oauth_clients').insert({ client_id: c.client_id, info: c }), 'registering client')
    },
    async savePending(p) {
      check(await db.from('oauth_pending').upsert({ id: p.id, data: p, expires_at: iso(p.expiresAt) }), 'saving sign-in')
    },
    async getPending(id) {
      const r = await db.from('oauth_pending').select('data').eq('id', id).maybeSingle()
      return (check(r, 'loading sign-in') as { data: PendingAuthorization } | null)?.data
    },
    async deletePending(id) {
      check(await db.from('oauth_pending').delete().eq('id', id), 'clearing sign-in')
    },
    async saveCode(c) {
      check(await db.from('oauth_codes').insert({ code_hash: c.codeHash, data: c, expires_at: iso(c.expiresAt) }), 'saving code')
    },
    async getCode(hash) {
      const r = await db.from('oauth_codes').select('data').eq('code_hash', hash).maybeSingle()
      return (check(r, 'loading code') as { data: AuthorizationCode } | null)?.data
    },
    async takeCode(hash) {
      const r = await db.from('oauth_codes').delete().eq('code_hash', hash).select('data')
      return (check(r, 'using code') as { data: AuthorizationCode }[] | null)?.[0]?.data
    },
    async saveToken(t) {
      check(
        await db.from('oauth_tokens').insert({
          token_hash: t.tokenHash,
          kind: t.kind,
          user_id: t.userId,
          client_id: t.clientId,
          scopes: t.scopes,
          resource: t.resource ?? null,
          expires_at: iso(t.expiresAt),
        }),
        'saving token',
      )
    },
    async getToken(hash) {
      const r = await db.from('oauth_tokens').select('*').eq('token_hash', hash).maybeSingle()
      return toToken(check(r, 'checking token'))
    },
    async markRotated(hash) {
      const r = await db.from('oauth_tokens').update({ kind: 'rotated' }).eq('token_hash', hash).eq('kind', 'refresh').select('*')
      return toToken((check(r, 'rotating token') as TokenRow[] | null)?.[0] ?? null)
    },
    async deleteToken(hash) {
      check(await db.from('oauth_tokens').delete().eq('token_hash', hash), 'revoking token')
    },
    async touchToken(hash, at) {
      check(await db.from('oauth_tokens').update({ last_used_at: iso(at) }).eq('token_hash', hash), 'updating token')
    },
    async revokeConnection(userId, clientId) {
      check(await db.from('oauth_tokens').delete().eq('user_id', userId).eq('client_id', clientId), 'disconnecting app')
      check(await db.from('oauth_codes').delete().eq('data->>userId', userId).eq('data->>clientId', clientId), 'disconnecting app')
    },
    async listConnections(userId) {
      const r = await db
        .from('oauth_tokens')
        .select('client_id, created_at, last_used_at, oauth_clients(info)')
        .eq('user_id', userId)
      const rows = check(r, 'listing connections') as unknown as {
        client_id: string
        created_at: string
        last_used_at: string | null
        oauth_clients: { info: OAuthClientInformationFull } | null
      }[]
      const byClient = new Map<string, Connection>()
      for (const row of rows ?? []) {
        const prev = byClient.get(row.client_id)
        const created = ms(row.created_at) ?? 0
        const used = ms(row.last_used_at) ?? 0
        byClient.set(row.client_id, {
          clientId: row.client_id,
          clientName: row.oauth_clients?.info.client_name ?? 'Unknown app',
          connectedAt: Math.min(prev?.connectedAt ?? Infinity, created),
          lastUsedAt: Math.max(prev?.lastUsedAt ?? 0, used) || null,
        })
      }
      return [...byClient.values()]
    },
  }
}

interface TokenRow {
  token_hash: string
  kind: 'access' | 'refresh' | 'rotated'
  user_id: string
  client_id: string
  scopes: string[]
  resource: string | null
  expires_at: string
}

function toToken(row: TokenRow | null): TokenRecord | undefined {
  if (!row) return undefined
  return {
    tokenHash: row.token_hash,
    kind: row.kind,
    userId: row.user_id,
    clientId: row.client_id,
    scopes: row.scopes,
    ...(row.resource && { resource: row.resource }),
    expiresAt: Date.parse(row.expires_at),
  }
}

function stateStore(db: SupabaseClient): Stores['state'] {
  return {
    forUser(userId): RemoteRepo {
      return {
        async pull() {
          const r = await db.from('user_state').select('state, version').eq('user_id', userId).maybeSingle()
          const row = check(r, 'loading data') as { state: unknown; version: string } | null
          if (!row) return null
          const parsed = appStateSchema.safeParse(row.state)
          if (!parsed.success) throw new Error('Stored data failed validation')
          return { state: parsed.data as AppState, version: row.version }
        },
        async push(state, base): Promise<PushResult> {
          const version = randomUUID()
          if (base === null) {
            const { error } = await db.from('user_state').insert({ user_id: userId, state, version })
            if (error?.code === '23505') return { ok: false }
            if (error) throw new Error(`Database error while saving: ${error.message}`)
            return { ok: true, version }
          }
          const r = await db.from('user_state').update({ state, version }).eq('user_id', userId).eq('version', base).select('version')
          const rows = check(r, 'saving data') as unknown[] | null
          return rows && rows.length > 0 ? { ok: true, version } : { ok: false }
        },
      }
    },
  }
}

function activityStore(db: SupabaseClient): Stores['activity'] {
  return {
    async add(e) {
      check(
        await db.from('activity_log').insert({
          user_id: e.userId,
          client_id: e.clientId,
          client_name: e.clientName,
          tool: e.tool,
          summary: e.summary,
          created_at: iso(e.at),
        }),
        'logging activity',
      )
    },
    async list(userId, limit) {
      const r = await db
        .from('activity_log')
        .select('user_id, client_id, client_name, tool, summary, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)
      const rows = check(r, 'loading activity') as {
        user_id: string
        client_id: string
        client_name: string
        tool: string
        summary: string
        created_at: string
      }[]
      return (rows ?? []).map(
        (x): ActivityEntry => ({
          userId: x.user_id,
          clientId: x.client_id,
          clientName: x.client_name,
          tool: x.tool,
          summary: x.summary,
          at: Date.parse(x.created_at),
        }),
      )
    },
  }
}

export function supabaseStores(url: string, serviceRoleKey: string, anonKey: string): Stores {
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const fresh = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  return {
    oauth: oauthStore(admin),
    activity: activityStore(admin),
    state: stateStore(admin),
    emailAuth: {
      async sendCode(email) {
        // Only existing Level Up accounts can connect; the connector never creates accounts.
        // Unknown emails fail silently so the page can't be used to discover who has an account.
        const { error } = await fresh().auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
        if (error && error.status !== undefined && error.status >= 500) throw new Error(error.message)
      },
      async verifyCode(email, code) {
        const { data, error } = await fresh().auth.verifyOtp({ email, token: code, type: 'email' })
        return error || !data.user ? null : data.user.id
      },
      async verifyPassword(email, password) {
        const { data, error } = await fresh().auth.signInWithPassword({ email, password })
        return error || !data.user ? null : data.user.id
      },
    },
    sessions: {
      async verify(token) {
        const { data, error } = await admin.auth.getUser(token)
        return error || !data.user ? null : data.user.id
      },
    },
  }
}
