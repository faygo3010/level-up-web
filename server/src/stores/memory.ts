import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js'
import type { PushResult, RemoteDoc, RemoteRepo } from '../../../app/src/core/sync'
import type { AppState } from '../../../app/src/core/types'
import type {
  ActivityEntry,
  ActivityStore,
  AuthorizationCode,
  Connection,
  EmailAuth,
  OAuthStore,
  PendingAuthorization,
  SessionVerifier,
  StateStore,
  Stores,
  TokenRecord,
} from './types'

/** In-memory stores for tests and local development. Not for production. */

export class MemoryOAuthStore implements OAuthStore {
  readonly clients = new Map<string, OAuthClientInformationFull>()
  readonly pending = new Map<string, PendingAuthorization>()
  readonly codes = new Map<string, AuthorizationCode>()
  readonly tokens = new Map<string, TokenRecord & { createdAt: number; lastUsedAt: number | null }>()

  async getClient(id: string) {
    return this.clients.get(id)
  }
  async saveClient(c: OAuthClientInformationFull) {
    this.clients.set(c.client_id, c)
  }
  async savePending(p: PendingAuthorization) {
    this.pending.set(p.id, p)
  }
  async getPending(id: string) {
    return this.pending.get(id)
  }
  async deletePending(id: string) {
    this.pending.delete(id)
  }
  async saveCode(c: AuthorizationCode) {
    this.codes.set(c.codeHash, c)
  }
  async getCode(hash: string) {
    return this.codes.get(hash)
  }
  async takeCode(hash: string) {
    const c = this.codes.get(hash)
    this.codes.delete(hash)
    return c
  }
  async saveToken(t: TokenRecord) {
    this.tokens.set(t.tokenHash, { ...t, createdAt: Date.now(), lastUsedAt: null })
  }
  async getToken(hash: string) {
    return this.tokens.get(hash)
  }
  async markRotated(hash: string) {
    const t = this.tokens.get(hash)
    if (!t || t.kind !== 'refresh') return undefined
    this.tokens.set(hash, { ...t, kind: 'rotated' })
    return t
  }
  async deleteToken(hash: string) {
    this.tokens.delete(hash)
  }
  async touchToken(hash: string, at: number) {
    const t = this.tokens.get(hash)
    if (t) this.tokens.set(hash, { ...t, lastUsedAt: at })
  }
  async revokeConnection(userId: string, clientId: string) {
    for (const [h, t] of this.tokens) if (t.userId === userId && t.clientId === clientId) this.tokens.delete(h)
    for (const [h, c] of this.codes) if (c.userId === userId && c.clientId === clientId) this.codes.delete(h)
  }
  async listConnections(userId: string): Promise<Connection[]> {
    const byClient = new Map<string, Connection>()
    for (const t of this.tokens.values()) {
      if (t.userId !== userId) continue
      const prev = byClient.get(t.clientId)
      const name = this.clients.get(t.clientId)?.client_name ?? 'Unknown app'
      byClient.set(t.clientId, {
        clientId: t.clientId,
        clientName: name,
        connectedAt: Math.min(prev?.connectedAt ?? Infinity, t.createdAt),
        lastUsedAt: Math.max(prev?.lastUsedAt ?? 0, t.lastUsedAt ?? 0) || null,
      })
    }
    return [...byClient.values()]
  }
}

export class MemoryActivityStore implements ActivityStore {
  readonly entries: ActivityEntry[] = []
  async add(e: ActivityEntry) {
    this.entries.unshift(e)
  }
  async list(userId: string, limit: number) {
    return this.entries.filter((e) => e.userId === userId).slice(0, limit)
  }
}

export class MemoryStateStore implements StateStore {
  readonly docs = new Map<string, RemoteDoc>()
  private n = 0
  forUser(userId: string): RemoteRepo {
    return {
      pull: async () => this.docs.get(userId) ?? null,
      push: async (state: AppState, base: string | null): Promise<PushResult> => {
        if ((this.docs.get(userId)?.version ?? null) !== base) return { ok: false }
        const version = `v${++this.n}`
        this.docs.set(userId, { state, version })
        return { ok: true, version }
      },
    }
  }
}

/** Fake email sign-in: the "email" is captured here instead of being sent. */
export class MemoryEmailAuth implements EmailAuth {
  readonly sent = new Map<string, string>()
  async sendCode(email: string) {
    this.sent.set(email, '123456')
  }
  async verifyCode(email: string, code: string) {
    return this.sent.get(email) === code ? `user:${email}` : null
  }
  /** Test accounts with passwords (email -> password). */
  readonly passwords = new Map<string, string>()
  async verifyPassword(email: string, password: string) {
    return this.passwords.get(email) === password ? `user:${email}` : null
  }
  /** Fake Google: "signs in" as this address. */
  googleEmail = 'google-user@example.com'
  async startGoogle(redirectTo: string) {
    const url = new URL('https://accounts.example.test/authorize')
    url.searchParams.set('redirect_to', redirectTo)
    return { url: url.href, state: { verifier: 'pkce-verifier' } }
  }
  async finishGoogle(code: string, state: Readonly<Record<string, string>>) {
    return code === 'google-ok' && state.verifier === 'pkce-verifier' ? { userId: `user:${this.googleEmail}`, email: this.googleEmail } : null
  }
}

export class MemorySessions implements SessionVerifier {
  readonly sessions = new Map<string, string>()
  async verify(token: string) {
    return this.sessions.get(token) ?? null
  }
}

export function memoryStores() {
  return {
    oauth: new MemoryOAuthStore(),
    activity: new MemoryActivityStore(),
    state: new MemoryStateStore(),
    emailAuth: new MemoryEmailAuth(),
    sessions: new MemorySessions(),
  } satisfies Stores
}
