import type { AuthorizationParams, OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js'
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js'
import {
  InvalidClientMetadataError,
  InvalidGrantError,
  InvalidRequestError,
  InvalidScopeError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import type { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import type { Response } from 'express'
import { createHash, randomBytes } from 'node:crypto'
import type { OAuthStore, TokenRecord } from '../stores/types'

export const SCOPES = { read: 'levelup:read', write: 'levelup:write' } as const
export const ALL_SCOPES: string[] = [SCOPES.read, SCOPES.write]

export const TTL = {
  pendingMs: 15 * 60_000,
  codeMs: 5 * 60_000,
  accessMs: 60 * 60_000,
  refreshMs: 90 * 24 * 60 * 60_000,
}

/** Opaque, unguessable secret (256 bits). */
export const secret = (): string => randomBytes(32).toString('base64url')
/** Only hashes of secrets are stored, so a database leak doesn't leak live tokens. */
export const hash = (value: string): string => createHash('sha256').update(value).digest('hex')

export interface ProviderOptions {
  readonly store: OAuthStore
  /** Where authorize() sends the user to sign in, e.g. https://host/signin */
  readonly signInUrl: string
  /** This server's MCP endpoint. Every token is bound to it (RFC 8707). */
  readonly resourceUrl: string
  readonly now?: () => number
}

const MAX_REDIRECT_URIS = 5
const MAX_URI_LENGTH = 500
const MAX_NAME_LENGTH = 60

const sameResource = (a: string, b: string) => a.replace(/#.*$/, '').replace(/\/$/, '') === b.replace(/#.*$/, '').replace(/\/$/, '')

/**
 * OAuth 2.1 authorization server for chat apps connecting to Level Up.
 * The SDK's router handles discovery, dynamic client registration, PKCE
 * checks and the HTTP side; this class handles what is specific to us.
 */
export class LevelUpOAuthProvider implements OAuthServerProvider {
  private readonly store: OAuthStore
  private readonly signInUrl: string
  private readonly resourceUrl: string
  private readonly now: () => number

  constructor(opts: ProviderOptions) {
    this.store = opts.store
    this.signInUrl = opts.signInUrl
    this.resourceUrl = opts.resourceUrl
    this.now = opts.now ?? Date.now
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: (id) => this.store.getClient(id),
      registerClient: async (info) => {
        if (info.redirect_uris.length > MAX_REDIRECT_URIS || info.redirect_uris.some((u) => String(u).length > MAX_URI_LENGTH)) {
          throw new InvalidClientMetadataError('Too many or too long redirect_uris')
        }
        // Chat apps are public clients protected by PKCE. Issuing no client secret
        // means there is no long-lived secret to store or leak.
        const { client_secret: _s, client_secret_expires_at: _e, ...rest } = info
        const client = {
          ...rest,
          ...(info.client_name && { client_name: info.client_name.trim().slice(0, MAX_NAME_LENGTH) }),
          token_endpoint_auth_method: 'none',
          client_id: randomBytes(16).toString('hex'),
          client_id_issued_at: Math.floor(this.now() / 1000),
        } as OAuthClientInformationFull
        await this.store.saveClient(client)
        return client
      },
    }
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    const requested = params.scopes?.length ? params.scopes : ALL_SCOPES
    const unknown = requested.filter((s) => !ALL_SCOPES.includes(s))
    if (unknown.length) throw new InvalidScopeError(`Unknown scope: ${unknown.join(' ')}`)
    if (params.resource && !sameResource(params.resource.href, this.resourceUrl)) {
      throw new InvalidRequestError('Unknown resource')
    }
    const id = secret()
    await this.store.savePending({
      id,
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      ...(params.state !== undefined && { state: params.state }),
      scopes: requested,
      resource: this.resourceUrl,
      expiresAt: this.now() + TTL.pendingMs,
    })
    res.redirect(302, `${this.signInUrl}?req=${encodeURIComponent(id)}`)
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, code: string): Promise<string> {
    const record = await this.store.getCode(hash(code))
    if (!record || record.clientId !== client.client_id) throw new InvalidGrantError('Invalid authorization code')
    return record.codeChallenge
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
    _verifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const record = await this.store.takeCode(hash(code))
    if (!record || record.clientId !== client.client_id) throw new InvalidGrantError('Invalid authorization code')
    if (record.expiresAt < this.now()) throw new InvalidGrantError('Authorization code expired')
    if (redirectUri !== undefined && redirectUri !== record.redirectUri) throw new InvalidGrantError('redirect_uri mismatch')
    if (resource && record.resource && resource.href !== record.resource) throw new InvalidGrantError('resource mismatch')
    return this.issue(record.userId, client.client_id, record.scopes, record.resource)
  }

  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, scopes?: string[]): Promise<OAuthTokens> {
    const tokenHash = hash(refreshToken)
    const record = await this.store.getToken(tokenHash)
    if (record?.kind === 'rotated') {
      // A refresh token used twice means it was copied: revoke everything this app holds for the user.
      await this.store.revokeConnection(record.userId, record.clientId)
      throw new InvalidGrantError('Refresh token already used; please reconnect')
    }
    if (!record || record.kind !== 'refresh' || record.clientId !== client.client_id) throw new InvalidGrantError('Invalid refresh token')
    if (record.expiresAt < this.now()) throw new InvalidGrantError('Refresh token expired')
    const granted = scopes?.length ? scopes : record.scopes
    if (granted.some((s) => !record.scopes.includes(s))) throw new InvalidScopeError('Cannot widen scopes on refresh')
    // Rotation: only after validating, mark it used atomically so it works exactly once (and a replay is detectable).
    if (!(await this.store.markRotated(tokenHash))) throw new InvalidGrantError('Invalid refresh token')
    return this.issue(record.userId, client.client_id, granted, record.resource)
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const tokenHash = hash(token)
    const record = await this.store.getToken(tokenHash)
    if (!record || record.kind !== 'access') throw new InvalidTokenError('Invalid access token')
    if (record.expiresAt < this.now()) throw new InvalidTokenError('Access token expired')
    void this.store.touchToken(tokenHash, this.now()).catch(() => {})
    return {
      token,
      clientId: record.clientId,
      scopes: [...record.scopes],
      expiresAt: Math.floor(record.expiresAt / 1000),
      ...(record.resource && { resource: new URL(record.resource) }),
      extra: { userId: record.userId },
    }
  }

  async revokeToken(_client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    await this.store.deleteToken(hash(request.token))
  }

  /** Called by the sign-in page once the user approves. Returns the code to send back. */
  async issueCode(pendingId: string): Promise<{ redirect: string }> {
    const p = await this.store.getPending(pendingId)
    if (!p || !p.userId || p.expiresAt < this.now()) throw new InvalidGrantError('Sign-in expired')
    const code = secret()
    await this.store.saveCode({
      codeHash: hash(code),
      clientId: p.clientId,
      userId: p.userId,
      redirectUri: p.redirectUri,
      codeChallenge: p.codeChallenge,
      scopes: p.scopes,
      ...(p.resource && { resource: p.resource }),
      expiresAt: this.now() + TTL.codeMs,
    })
    await this.store.deletePending(pendingId)
    const url = new URL(p.redirectUri)
    url.searchParams.set('code', code)
    if (p.state !== undefined) url.searchParams.set('state', p.state)
    return { redirect: url.href }
  }

  private async issue(userId: string, clientId: string, scopes: readonly string[], resource?: string): Promise<OAuthTokens> {
    const access = secret()
    const refresh = secret()
    const base = { userId, clientId, scopes, ...(resource && { resource }) }
    const records: TokenRecord[] = [
      { ...base, tokenHash: hash(access), kind: 'access', expiresAt: this.now() + TTL.accessMs },
      { ...base, tokenHash: hash(refresh), kind: 'refresh', expiresAt: this.now() + TTL.refreshMs },
    ]
    for (const r of records) await this.store.saveToken(r)
    return {
      access_token: access,
      token_type: 'Bearer',
      expires_in: TTL.accessMs / 1000,
      refresh_token: refresh,
      scope: scopes.join(' '),
    }
  }
}
