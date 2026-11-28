import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createHash, randomBytes } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from '../src/app'
import { memoryStores } from '../src/stores/memory'

const REDIRECT = 'https://chat.example/callback'
const EMAIL = 'trader@example.com'
const USER = `user:${EMAIL}`

let server: Server
let base: string
let stores: ReturnType<typeof memoryStores>

beforeEach(async () => {
  stores = memoryStores()
  const app = createApp({ publicUrl: 'http://127.0.0.1', appOrigins: ['https://app.example'], stores, trustProxy: 0 })
  server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(() => new Promise<void>((r) => server.close(() => r())))

const form = (data: Record<string, string>, cookie = '') => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie && { cookie }) },
  body: new URLSearchParams(data).toString(),
  redirect: 'manual' as const,
})

async function register(name = 'Test Chat'): Promise<string> {
  const res = await fetch(`${base}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ redirect_uris: [REDIRECT], client_name: name, token_endpoint_auth_method: 'none' }),
  })
  expect(res.status).toBe(201)
  return ((await res.json()) as { client_id: string }).client_id
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

/** Start authorization and return the pending sign-in id from the redirect. */
async function startAuthorize(clientId: string, challenge: string, scope?: string): Promise<string> {
  const url = new URL(`${base}/authorize`)
  const params: Record<string, string> = {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'state-123',
    ...(scope && { scope }),
  }
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, { redirect: 'manual' })
  expect(res.status).toBe(302)
  const location = new URL(res.headers.get('location')!, base)
  expect(location.pathname).toBe('/signin')
  return location.searchParams.get('req')!
}

/** Open the sign-in link in a "browser" and return the cookie it was given. */
async function openSignIn(req: string): Promise<string> {
  const res = await fetch(`${base}/signin?req=${req}`)
  expect(res.status).toBe(200)
  return res.headers.get('set-cookie')!.split(';')[0]!
}

/** Walk the sign-in pages as the user and return the authorization code. */
async function signInAndApprove(req: string): Promise<string> {
  const cookie = await openSignIn(req)
  expect((await fetch(`${base}/signin/email`, form({ req, email: EMAIL }, cookie))).status).toBe(200)
  const consent = await fetch(`${base}/signin/code`, form({ req, email: EMAIL, code: '123456' }, cookie))
  expect(consent.status).toBe(200)
  expect(await consent.text()).toContain('Allow Test Chat to use your Level Up?')
  const res = await fetch(`${base}/signin/consent`, form({ req, decision: 'allow' }, cookie))
  expect(res.status).toBe(302)
  const cb = new URL(res.headers.get('location')!)
  expect(cb.origin + cb.pathname).toBe(REDIRECT)
  expect(cb.searchParams.get('state')).toBe('state-123')
  return cb.searchParams.get('code')!
}

async function token(params: Record<string, string>) {
  const res = await fetch(`${base}/token`, form(params))
  return { status: res.status, body: (await res.json()) as Record<string, string> }
}

async function connect(scope?: string) {
  const clientId = await register()
  const { verifier, challenge } = pkce()
  const code = await signInAndApprove(await startAuthorize(clientId, challenge, scope))
  const { status, body } = await token({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: REDIRECT, client_id: clientId })
  expect(status).toBe(200)
  return { clientId, code, verifier, tokens: body }
}

async function mcpClient(accessToken: string) {
  const client = new Client({ name: 'test-chat', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
  await client.connect(transport)
  return client
}

const textOf = (r: unknown) => ((r as { content: { text: string }[] }).content[0]?.text ?? '')

describe('discovery', () => {
  it('advertises OAuth and protected-resource metadata', async () => {
    const as = (await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json()) as Record<string, unknown>
    expect(as).toMatchObject({ authorization_endpoint: expect.stringContaining('/authorize'), code_challenge_methods_supported: ['S256'] })
    const pr = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)
    expect(pr.status).toBe(200)
  })

  it('rejects MCP calls without a token and points to the metadata', async () => {
    const res = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toContain('resource_metadata')
  })
})

describe('full connect flow', () => {
  it('lets a chat app sign in, read the schedule, and tick something off', async () => {
    const { tokens } = await connect()
    expect(tokens.scope).toBe('levelup:read levelup:write')
    const client = await mcpClient(tokens.access_token!)

    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(['get_today', 'complete_routine', 'add_journal_entry']))
    expect(tools.find((t) => t.name === 'archive_area')?.annotations?.destructiveHint).toBe(true)
    expect(tools.find((t) => t.name === 'get_today')?.annotations?.readOnlyHint).toBe(true)

    expect(textOf(await client.callTool({ name: 'get_today', arguments: {} }))).toContain('Rules check')

    const done = await client.callTool({ name: 'complete_routine', arguments: { routine: '10k steps' } })
    expect(textOf(done)).toMatch(/Ticked off "10k steps"/)

    const doc = stores.state.docs.get(USER)
    expect(Object.values(doc!.state.completions).flat()).toContain('fit-steps')
    expect(stores.activity.entries[0]).toMatchObject({ userId: USER, clientName: 'Test Chat', tool: 'complete_routine' })
    await client.close()
  })

  it('returns tool errors as readable messages, not crashes', async () => {
    const client = await mcpClient((await connect()).tokens.access_token!)
    const r = await client.callTool({ name: 'complete_routine', arguments: { routine: 'nonexistent thing' } })
    expect(r.isError).toBe(true)
    expect(textOf(r)).toMatch(/No routine is called/)
    await client.close()
  })

  it('works alongside the app: changes from the app are visible to the chatbot', async () => {
    const { tokens } = await connect()
    const client = await mcpClient(tokens.access_token!)
    await client.callTool({ name: 'add_area', arguments: { name: 'Health' } })
    // The app (another writer) renames the area via its own sync.
    const repo = stores.state.forUser(USER)
    const doc = (await repo.pull())!
    const areas = doc.state.areas.map((a) => (a.name === 'Health' ? { ...a, name: 'Health & sleep' } : a))
    expect((await repo.push({ ...doc.state, areas }, doc.version)).ok).toBe(true)
    expect(textOf(await client.callTool({ name: 'get_system', arguments: {} }))).toContain('Health & sleep')
    await client.close()
  })
})

describe('token security', () => {
  it('enforces PKCE', async () => {
    const clientId = await register()
    const { challenge } = pkce()
    const code = await signInAndApprove(await startAuthorize(clientId, challenge))
    const r = await token({ grant_type: 'authorization_code', code, code_verifier: pkce().verifier, redirect_uri: REDIRECT, client_id: clientId })
    expect(r.status).toBe(400)
  })

  it('allows an authorization code to be used only once', async () => {
    const { clientId, code, verifier } = await connect()
    const again = await token({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: REDIRECT, client_id: clientId })
    expect(again.status).toBe(400)
  })

  it('rotates refresh tokens, and a replayed one revokes the whole connection', async () => {
    const { clientId, tokens } = await connect()
    const first = await token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token!, client_id: clientId })
    expect(first.status).toBe(200)
    expect(first.body.access_token).not.toBe(tokens.access_token)
    const reuse = await token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token!, client_id: clientId })
    expect(reuse.status).toBe(400)
    const newer = await token({ grant_type: 'refresh_token', refresh_token: first.body.refresh_token!, client_id: clientId })
    expect(newer.status).toBe(400)
  })

  it('checks the token before reading the body and never returns HTML errors', async () => {
    const noAuth = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' })
    expect(noAuth.status).toBe(401)
    const { tokens } = await connect()
    const bad = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${tokens.access_token}` },
      body: '{bad',
    })
    expect(bad.status).toBe(400)
    expect(await bad.json()).toMatchObject({ jsonrpc: '2.0', error: { code: -32700 } })
  })

  it('never stores raw tokens', async () => {
    const { tokens } = await connect()
    const stored = [...stores.oauth.tokens.keys()]
    expect(stored).not.toContain(tokens.access_token)
    expect(stored).not.toContain(tokens.refresh_token)
  })

  it('a read-only connection cannot see or use write tools', async () => {
    const { tokens } = await connect('levelup:read')
    const client = await mcpClient(tokens.access_token!)
    const names = (await client.listTools()).tools.map((t) => t.name)
    expect(names).toContain('get_today')
    expect(names).not.toContain('complete_routine')
    await client.close()
  })
})

describe('sign-in pages', () => {
  it('escapes the app name to prevent script injection', async () => {
    const res = await fetch(`${base}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: [REDIRECT], client_name: '<script>alert(1)</script>', token_endpoint_auth_method: 'none' }),
    })
    const { client_id } = (await res.json()) as { client_id: string }
    const req = await startAuthorize(client_id, pkce().challenge)
    const page = await fetch(`${base}/signin?req=${req}`)
    const html = await page.text()
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(page.headers.get('x-frame-options')).toBe('DENY')
  })

  it('redirects back with access_denied when the user cancels', async () => {
    const req = await startAuthorize(await register(), pkce().challenge)
    const cookie = await openSignIn(req)
    await fetch(`${base}/signin/email`, form({ req, email: EMAIL }, cookie))
    await fetch(`${base}/signin/code`, form({ req, email: EMAIL, code: '123456' }, cookie))
    const res = await fetch(`${base}/signin/consent`, form({ req, decision: 'deny' }, cookie))
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('access_denied')
  })

  it('cannot skip straight to consent without signing in', async () => {
    const req = await startAuthorize(await register(), pkce().challenge)
    const cookie = await openSignIn(req)
    const res = await fetch(`${base}/signin/consent`, form({ req, decision: 'allow' }, cookie))
    expect(res.status).toBe(400)
  })

  it('stops an attacker who sends their sign-in link to a victim (consent hijack)', async () => {
    // Attacker starts a connection for their own app and sends the link to the victim.
    const req = await startAuthorize(await register('Evil'), pkce().challenge)
    // The victim opens it and signs in with their own email code in their browser.
    const victim = await openSignIn(req)
    await fetch(`${base}/signin/email`, form({ req, email: EMAIL }, victim))
    await fetch(`${base}/signin/code`, form({ req, email: EMAIL, code: '123456' }, victim))
    // The attacker, without the victim's browser cookie, tries to approve.
    expect((await fetch(`${base}/signin/consent`, form({ req, decision: 'allow' }))).status).toBe(400)
    expect((await fetch(`${base}/signin/consent`, form({ req, decision: 'allow' }, 'lu_signin=forged'))).status).toBe(400)
    // Nor can the attacker re-open the link to get a cookie of their own.
    expect((await fetch(`${base}/signin?req=${req}`)).status).toBe(400)
    expect(stores.oauth.codes.size).toBe(0)
  })

  it('cancels the sign-in after too many wrong codes', async () => {
    const req = await startAuthorize(await register(), pkce().challenge)
    const cookie = await openSignIn(req)
    await fetch(`${base}/signin/email`, form({ req, email: EMAIL }, cookie))
    const tryCode = (code: string) => fetch(`${base}/signin/code`, form({ req, email: EMAIL, code }, cookie))
    for (let i = 0; i < 4; i++) expect((await tryCode('000000')).status).toBe(400)
    expect((await tryCode('000000')).status).toBe(429)
    expect((await tryCode('123456')).status).toBe(429)
  })

  it('limits code guesses per email across separate sign-ins', async () => {
    const guess = async () => {
      const req = await startAuthorize(await register(), pkce().challenge)
      const cookie = await openSignIn(req)
      return fetch(`${base}/signin/code`, form({ req, email: EMAIL, code: '000000' }, cookie))
    }
    for (let i = 0; i < 5; i++) await guess()
    expect((await guess()).status).toBe(429)
  })

  it('issues no client secrets and caps registration input', async () => {
    const res = await fetch(`${base}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: [REDIRECT], client_name: 'x'.repeat(500) }),
    })
    const body = (await res.json()) as Record<string, unknown>
    expect(body.client_secret).toBeUndefined()
    expect(body.token_endpoint_auth_method).toBe('none')
    expect(String(body.client_name)).toHaveLength(60)
    const many = await fetch(`${base}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: Array.from({ length: 6 }, (_, i) => `https://x.example/${i}`) }),
    })
    expect(many.status).toBe(400)
  })

  it('rejects tokens requested for a different resource', async () => {
    const url = new URL(`${base}/authorize`)
    const params = { response_type: 'code', client_id: await register(), redirect_uri: REDIRECT, code_challenge: pkce().challenge, code_challenge_method: 'S256', resource: 'https://other.example/mcp' }
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    const res = await fetch(url, { redirect: 'manual' })
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('invalid_request')
  })

  it('rejects unknown or missing sign-in ids', async () => {
    expect((await fetch(`${base}/signin?req=nope`)).status).toBe(400)
    expect((await fetch(`${base}/signin`)).status).toBe(400)
  })
})

describe('app API (connected apps & activity)', () => {
  const auth = { Authorization: 'Bearer app-session' }
  beforeEach(() => stores.sessions.sessions.set('app-session', USER))

  it('requires an app session', async () => {
    expect((await fetch(`${base}/api/connections`)).status).toBe(401)
    expect((await fetch(`${base}/api/connections`, { headers: { Authorization: 'Bearer wrong' } })).status).toBe(401)
  })

  it('lists connected apps and activity, and disconnecting revokes access', async () => {
    const { clientId, tokens } = await connect()
    const client = await mcpClient(tokens.access_token!)
    await client.callTool({ name: 'add_journal_entry', arguments: { kind: 'workout', activity: 'Run', minutes: 30 } })
    await client.close()

    const list = (await (await fetch(`${base}/api/connections`, { headers: auth })).json()) as { data: { clientName: string }[] }
    expect(list.data.map((c) => c.clientName)).toEqual(['Test Chat'])

    const activity = (await (await fetch(`${base}/api/activity`, { headers: auth })).json()) as { data: { summary: string; userId?: string }[] }
    expect(activity.data[0]?.summary).toMatch(/Workout Run, 30 min/)
    expect(activity.data[0]?.userId).toBeUndefined()

    expect((await fetch(`${base}/api/connections/${clientId}`, { method: 'DELETE', headers: auth })).status).toBe(200)
    const after = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', Authorization: `Bearer ${tokens.access_token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    expect(after.status).toBe(401)
  })

  it('only answers CORS preflight for the app origin', async () => {
    const ok = await fetch(`${base}/api/connections`, { method: 'OPTIONS', headers: { Origin: 'https://app.example' } })
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://app.example')
    const evil = await fetch(`${base}/api/connections`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } })
    expect(evil.headers.get('access-control-allow-origin')).toBeNull()
  })

  it("never shows one user another user's connections", async () => {
    await connect()
    stores.sessions.sessions.set('other-session', 'user:someone-else')
    const list = (await (await fetch(`${base}/api/connections`, { headers: { Authorization: 'Bearer other-session' } })).json()) as { data: unknown[] }
    expect(list.data).toEqual([])
  })
})

describe('password sign-in on the connect page', () => {
  it('connects with an email and password, and rejects a wrong one', async () => {
    stores.emailAuth.passwords.set(EMAIL, 'correct-horse')
    const clientId = await register()
    const { verifier, challenge } = pkce()
    const req = await startAuthorize(clientId, challenge)
    const cookie = await openSignIn(req)
    const page = await (await fetch(`${base}/signin?req=${req}`, { headers: { cookie } })).text()
    expect(page).toContain('action="/signin/password"')
    const wrong = await fetch(`${base}/signin/password`, form({ req, email: EMAIL, password: 'nope' }, cookie))
    expect(wrong.status).toBe(400)
    expect(await wrong.text()).toContain('Email or password is incorrect.')
    const ok = await fetch(`${base}/signin/password`, form({ req, email: EMAIL, password: 'correct-horse' }, cookie))
    expect(await ok.text()).toContain('Allow Test Chat to use your Level Up?')
    const done = await fetch(`${base}/signin/consent`, form({ req, decision: 'allow' }, cookie))
    const code = new URL(done.headers.get('location')!).searchParams.get('code')!
    expect((await token({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: REDIRECT, client_id: clientId })).status).toBe(200)
  })

  it('needs the browser cookie for password sign-in too', async () => {
    stores.emailAuth.passwords.set(EMAIL, 'correct-horse')
    const req = await startAuthorize(await register(), pkce().challenge)
    await openSignIn(req)
    expect((await fetch(`${base}/signin/password`, form({ req, email: EMAIL, password: 'correct-horse' }))).status).toBe(400)
  })
})

describe('Google sign-in on the connect page', () => {
  const googleStart = async () => {
    const clientId = await register()
    const { verifier, challenge } = pkce()
    const req = await startAuthorize(clientId, challenge)
    const cookie = await openSignIn(req)
    const res = await fetch(`${base}/signin/google`, form({ req }, cookie))
    expect(res.status).toBe(303)
    const to = new URL(res.headers.get('location')!)
    expect(to.searchParams.get('redirect_to')).toBe('http://127.0.0.1/signin/google/callback')
    const reqCookie = res.headers.get('set-cookie')!.split(';')[0]!
    expect(reqCookie).toBe(`lu_req=${req}`)
    return { clientId, verifier, req, cookies: `${cookie}; ${reqCookie}`, bindCookie: cookie }
  }

  it('offers Google, and connects once Google sends the user back', async () => {
    const { clientId, verifier, req, cookies } = await googleStart()
    const back = await fetch(`${base}/signin/google/callback?code=google-ok`, { headers: { cookie: cookies } })
    expect(back.status).toBe(200)
    const page = await back.text()
    expect(page).toContain('Allow Test Chat to use your Level Up?')
    expect(page).toContain('google-user@example.com')
    const done = await fetch(`${base}/signin/consent`, form({ req, decision: 'allow' }, cookies))
    const code = new URL(done.headers.get('location')!).searchParams.get('code')!
    expect((await token({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: REDIRECT, client_id: clientId })).status).toBe(200)
  })

  it('rejects a callback from another browser, a bad code, or a reused one', async () => {
    const { req, cookies, bindCookie } = await googleStart()
    // Another browser: has the request id but not the binding cookie.
    expect((await fetch(`${base}/signin/google/callback?code=google-ok`, { headers: { cookie: `lu_req=${req}` } })).status).toBe(400)
    expect((await fetch(`${base}/signin/google/callback?code=google-ok`, { headers: { cookie: bindCookie } })).status).toBe(400)
    const bad = await fetch(`${base}/signin/google/callback?code=forged`, { headers: { cookie: cookies } })
    expect(bad.status).toBe(400)
    expect(await bad.text()).toContain('Google sign-in didn&#39;t finish')
    // The PKCE state is spent after one try.
    expect((await fetch(`${base}/signin/google/callback?code=google-ok`, { headers: { cookie: cookies } })).status).toBe(400)
  })

  it('hides email codes when they are switched off', async () => {
    server.close()
    const app = createApp({ publicUrl: 'http://127.0.0.1', appOrigins: [], stores, trustProxy: 0, emailCodes: false })
    server = app.listen(0)
    await new Promise((r) => server.once('listening', r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const req = await startAuthorize(await register(), pkce().challenge)
    const cookie = await openSignIn(req)
    const page = await (await fetch(`${base}/signin?req=${req}`, { headers: { cookie } })).text()
    expect(page).toContain('Continue with Google')
    expect(page).not.toContain('Email me a code')
    expect((await fetch(`${base}/signin/email`, form({ req, email: EMAIL }, cookie))).status).toBe(404)
  })
})
