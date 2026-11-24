import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { UnauthorizedError, type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { OAuthClientInformationMixed, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import type { AddressInfo } from 'node:net'
import { createServer, type Server } from 'node:http'
import { createApp } from '../src/app'
import { memoryStores } from '../src/stores/memory'

/**
 * Connects the way a real chat app does: start with no credentials, get a
 * 401, discover everything from metadata, register, send the "user" through
 * the sign-in pages, then finish auth and call tools. Nothing is hard-coded
 * except the /mcp URL the user would paste in.
 */

const REDIRECT = 'https://chat.example/oauth/callback'

class ChatAppAuth implements OAuthClientProvider {
  info?: OAuthClientInformationMixed
  saved?: OAuthTokens
  verifier = ''
  authorizationUrl?: URL
  get redirectUrl() {
    return REDIRECT
  }
  get clientMetadata() {
    return { client_name: 'SDK Chat', redirect_uris: [REDIRECT], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }
  }
  clientInformation() {
    return this.info
  }
  saveClientInformation(info: OAuthClientInformationMixed) {
    this.info = info
  }
  tokens() {
    return this.saved
  }
  saveTokens(t: OAuthTokens) {
    this.saved = t
  }
  redirectToAuthorization(url: URL) {
    this.authorizationUrl = url
  }
  saveCodeVerifier(v: string) {
    this.verifier = v
  }
  codeVerifier() {
    return this.verifier
  }
}

let server: Server
let base: string

beforeEach(async () => {
  // Bind first, so the app can advertise its real address (port included) in its metadata.
  server = createServer().listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  server.on('request', createApp({ publicUrl: base, appOrigins: [], stores: memoryStores(), trustProxy: 0 }))
})
afterEach(() => new Promise<void>((r) => server.close(() => r())))

/** Play the human: follow /authorize to the sign-in pages and approve. */
async function userApproves(authorizationUrl: URL): Promise<string> {
  const start = await fetch(authorizationUrl, { redirect: 'manual' })
  const signIn = new URL(start.headers.get('location')!, base)
  const req = signIn.searchParams.get('req')!
  const cookie = (await fetch(signIn)).headers.get('set-cookie')!.split(';')[0]!
  const post = (path: string, data: Record<string, string>) =>
    fetch(`${base}${path}`, { method: 'POST', body: new URLSearchParams(data), headers: { cookie }, redirect: 'manual' })
  await post('/signin/email', { req, email: 'me@example.com' })
  await post('/signin/code', { req, email: 'me@example.com', code: '123456' })
  const done = await post('/signin/consent', { req, decision: 'allow' })
  return new URL(done.headers.get('location')!).searchParams.get('code')!
}

it('a standard MCP client can discover, authorize and use the connector', async () => {
  const auth = new ChatAppAuth()
  const mcpUrl = new URL(`${base}/mcp`)

  const first = new StreamableHTTPClientTransport(mcpUrl, { authProvider: auth })
  await expect(new Client({ name: 'sdk-chat', version: '1' }).connect(first)).rejects.toBeInstanceOf(UnauthorizedError)
  expect(auth.info?.client_id).toBeTruthy() // registered itself via discovery
  expect(auth.authorizationUrl?.searchParams.get('code_challenge_method')).toBe('S256')

  const code = await userApproves(auth.authorizationUrl!)
  await first.finishAuth(code)
  expect(auth.saved?.access_token).toBeTruthy()

  const client = new Client({ name: 'sdk-chat', version: '1' })
  await client.connect(new StreamableHTTPClientTransport(mcpUrl, { authProvider: auth }))
  const result = await client.callTool({ name: 'add_journal_entry', arguments: { kind: 'note', text: 'Connected from chat' } })
  expect((result.content as { text: string }[])[0]?.text).toMatch(/Saved: .*Note — Connected from chat/)
  await client.close()
})
