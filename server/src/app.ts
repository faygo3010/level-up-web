import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js'
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import express, { type Express, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import { appApiRouter } from './api'
import { buildMcpServer, callerFrom } from './mcp'
import { ALL_SCOPES, LevelUpOAuthProvider } from './oauth/provider'
import { signInRouter } from './oauth/signin'
import type { Stores } from './stores/types'

export interface AppOptions {
  /** Public base URL of this server, e.g. https://levelup-connector.onrender.com */
  readonly publicUrl: string
  /** Origins of the Level Up app allowed to call /api (CORS). */
  readonly appOrigins: readonly string[]
  readonly stores: Stores
  readonly now?: () => number
  /**
   * Number of reverse-proxy hops in front of this server (Render: 1). Used to
   * find the real client IP for rate limits. 0 when exposed directly.
   */
  readonly trustProxy?: number
}

const jsonRpcError = (res: Response, status: number, message: string) =>
  res.status(status).json({ jsonrpc: '2.0', error: { code: -32000, message }, id: null })

export function createApp({ publicUrl, appOrigins, stores, now, trustProxy = 1 }: AppOptions): Express {
  const base = new URL(publicUrl)
  const mcpUrl = new URL('/mcp', base)
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', trustProxy)

  const provider = new LevelUpOAuthProvider({
    store: stores.oauth,
    signInUrl: new URL('/signin', base).href,
    resourceUrl: mcpUrl.href,
    ...(now && { now }),
  })

  // OAuth discovery, client registration, /authorize, /token, /revoke (rate-limited by the SDK).
  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: base,
      resourceServerUrl: mcpUrl,
      scopesSupported: ALL_SCOPES,
      resourceName: 'Level Up',
    }),
  )
  app.use(
    signInRouter({ store: stores.oauth, emailAuth: stores.emailAuth, provider, secureCookies: base.protocol === 'https:', ...(now && { now }) }),
  )
  app.use('/api', appApiRouter(stores, appOrigins))

  const bearer = requireBearerAuth({
    verifier: provider,
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl),
    expectedResource: mcpUrl,
  })
  const mcpLimiter = rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Runs after the bearer check, so every request here has a verified user and app.
    keyGenerator: (req) => `${req.auth!.clientId}:${String(req.auth!.extra?.userId)}`,
    handler: (_req, res) => jsonRpcError(res, 429, 'Too many requests. Slow down and try again in a minute.'),
  })

  // Check the token before reading the body, so unauthenticated requests can't make us parse anything.
  app.post('/mcp', bearer, mcpLimiter, express.json({ limit: '256kb' }), async (req: Request, res: Response) => {
    try {
      const auth = req.auth!
      const client = await stores.oauth.getClient(auth.clientId)
      const caller = callerFrom(auth, client?.client_name?.slice(0, 60) ?? 'AI app')
      const server = buildMcpServer(caller, stores, now)
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
      res.on('close', () => {
        void transport.close()
        void server.close()
      })
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (e) {
      console.error('[mcp] request failed', e)
      if (!res.headersSent) jsonRpcError(res, 500, 'Internal server error')
    }
  })
  // Stateless server: no server-initiated streams or sessions to resume or end.
  app.get('/mcp', (_req, res) => jsonRpcError(res.set('Allow', 'POST'), 405, 'Method not allowed'))
  app.delete('/mcp', (_req, res) => jsonRpcError(res.set('Allow', 'POST'), 405, 'Method not allowed'))

  app.get('/', (_req, res) => {
    res
      .type('text')
      .send(`Level Up connector.\n\nAdd this URL as a custom connector in your AI app:\n${mcpUrl.href}\n`)
  })
  app.get('/healthz', (_req, res) => res.json({ ok: true }))

  // Body errors and anything unexpected become JSON, never an HTML page with a stack trace.
  app.use((err: unknown, _req: Request, res: Response, next: (e?: unknown) => void) => {
    if (res.headersSent) return next(err)
    const type = (err as { type?: string })?.type
    if (type === 'entity.parse.failed') return void res.status(400).json({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null })
    if (type === 'entity.too.large') return void jsonRpcError(res, 413, 'Request too large')
    console.error('[http] unhandled error', err instanceof Error ? err.message : 'unknown')
    jsonRpcError(res, 500, 'Internal server error')
  })

  return app
}
