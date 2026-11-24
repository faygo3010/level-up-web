import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js'
import type { RemoteRepo } from '../../../app/src/core/sync'

/** A sign-in started by a chat app, waiting for the user to sign in and approve. */
export interface PendingAuthorization {
  readonly id: string
  readonly clientId: string
  readonly redirectUri: string
  readonly codeChallenge: string
  readonly state?: string
  readonly scopes: readonly string[]
  readonly resource?: string
  readonly expiresAt: number
  /** Set once the user has proved who they are. */
  readonly userId?: string
  readonly email?: string
  /** Wrong-code attempts; the sign-in is cancelled after too many. */
  readonly attempts?: number
  /** Hash of the cookie of the browser that opened this sign-in; all later steps must come from it. */
  readonly browserHash?: string
}

export interface AuthorizationCode {
  readonly codeHash: string
  readonly clientId: string
  readonly userId: string
  readonly redirectUri: string
  readonly codeChallenge: string
  readonly scopes: readonly string[]
  readonly resource?: string
  readonly expiresAt: number
}

export interface TokenRecord {
  readonly tokenHash: string
  readonly kind: 'access' | 'refresh'
  readonly userId: string
  readonly clientId: string
  readonly scopes: readonly string[]
  readonly resource?: string
  readonly expiresAt: number
}

export interface Connection {
  readonly clientId: string
  readonly clientName: string
  readonly connectedAt: number
  readonly lastUsedAt: number | null
}

export interface ActivityEntry {
  readonly userId: string
  readonly clientId: string
  readonly clientName: string
  readonly tool: string
  readonly summary: string
  readonly at: number
}

/** Everything the OAuth server needs to remember. Secrets are only ever stored hashed. */
export interface OAuthStore {
  getClient(clientId: string): Promise<OAuthClientInformationFull | undefined>
  saveClient(client: OAuthClientInformationFull): Promise<void>

  savePending(p: PendingAuthorization): Promise<void>
  getPending(id: string): Promise<PendingAuthorization | undefined>
  deletePending(id: string): Promise<void>

  saveCode(code: AuthorizationCode): Promise<void>
  getCode(codeHash: string): Promise<AuthorizationCode | undefined>
  /** Atomically fetch and delete, so a code can only ever be used once. */
  takeCode(codeHash: string): Promise<AuthorizationCode | undefined>

  saveToken(t: TokenRecord): Promise<void>
  getToken(tokenHash: string): Promise<TokenRecord | undefined>
  /** Atomically fetch and delete (refresh-token rotation). */
  takeToken(tokenHash: string): Promise<TokenRecord | undefined>
  deleteToken(tokenHash: string): Promise<void>
  touchToken(tokenHash: string, at: number): Promise<void>
  /** Disconnect a chat app: drop all its tokens and unused codes for this user. */
  revokeConnection(userId: string, clientId: string): Promise<void>
  listConnections(userId: string): Promise<Connection[]>
}

export interface ActivityStore {
  add(entry: ActivityEntry): Promise<void>
  list(userId: string, limit: number): Promise<ActivityEntry[]>
}

/** Per-user access to the synced Level Up document (same contract the app uses). */
export interface StateStore {
  forUser(userId: string): RemoteRepo
}

/** Email one-time-code sign-in. */
export interface EmailAuth {
  sendCode(email: string): Promise<void>
  /** Returns the user id, or null if the code is wrong or expired. */
  verifyCode(email: string, code: string): Promise<string | null>
}

/** Verifies a Level Up app session (for the app's "Connected AI apps" screen). */
export interface SessionVerifier {
  /** Returns the user id for a valid app access token, else null. */
  verify(accessToken: string): Promise<string | null>
}

export interface Stores {
  readonly oauth: OAuthStore
  readonly activity: ActivityStore
  readonly state: StateStore
  readonly emailAuth: EmailAuth
  readonly sessions: SessionVerifier
}
