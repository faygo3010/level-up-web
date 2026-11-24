import { starterState } from '../../app/src/core/defaults'
import type { RemoteRepo } from '../../app/src/core/sync'
import { runTool, type Caller } from '../src/mcp'
import { LevelUpOAuthProvider, SCOPES, TTL, hash } from '../src/oauth/provider'
import { MemoryActivityStore, MemoryOAuthStore, MemoryStateStore } from '../src/stores/memory'
import { TOOLS } from '../src/tools'

const tool = (name: string) => TOOLS.find((t) => t.name === name)!
const caller: Caller = { userId: 'u1', clientId: 'c1', clientName: 'Claude', scopes: [SCOPES.read, SCOPES.write] }
const NOW = Date.parse('2026-11-24T12:00:00Z')
const textOf = (r: { content: unknown[] }) => (r.content[0] as { text: string }).text

describe('runTool', () => {
  it('creates a starter system for a brand-new account on first write', async () => {
    const state = new MemoryStateStore()
    const activity = new MemoryActivityStore()
    const r = await runTool(tool('complete_routine'), { routine: 'train' }, caller, { state, activity }, () => NOW)
    expect(r.isError).toBeUndefined()
    expect(state.docs.get('u1')?.state.areas).toHaveLength(4)
    expect(activity.entries).toHaveLength(1)
  })

  it('uses the user’s time zone for "today"', async () => {
    const state = new MemoryStateStore()
    const tokyo = { ...starterState('2026-11-24'), settings: { ...starterState('2026-11-24').settings, timeZone: 'Asia/Tokyo' } }
    await state.forUser('u1').push(tokyo, null)
    const late = Date.parse('2026-11-24T20:00:00Z') // already the 25th in Tokyo
    const r = await runTool(tool('get_today'), {}, caller, { state, activity: new MemoryActivityStore() }, () => late)
    expect(textOf(r)).toContain('(2026-11-25)')
  })

  it('retries when another device saves at the same moment, keeping both changes', async () => {
    const state = new MemoryStateStore()
    const repo = state.forUser('u1')
    await repo.push(starterState('2026-11-24'), null)
    const real = state.forUser.bind(state)
    let interfered = false
    state.forUser = (id: string): RemoteRepo => {
      const inner = real(id)
      return {
        pull: inner.pull,
        async push(s, base) {
          if (!interfered) {
            interfered = true // the app sneaks in a write first
            const doc = (await inner.pull())!
            await inner.push({ ...doc.state, completions: { '2026-11-24': ['fit-steps'] } }, doc.version)
          }
          return inner.push(s, base)
        },
      }
    }
    const r = await runTool(tool('complete_routine'), { routine: 'train' }, caller, { state, activity: new MemoryActivityStore() }, () => NOW)
    expect(r.isError).toBeUndefined()
    expect(state.docs.get('u1')?.state.completions['2026-11-24']).toEqual(['fit-steps', 'fit-train'])
  })

  it('gives up politely if saving keeps colliding', async () => {
    const state = { forUser: (): RemoteRepo => ({ pull: async () => null, push: async () => ({ ok: false }) }) }
    const r = await runTool(tool('add_area'), { name: 'Health' }, caller, { state, activity: new MemoryActivityStore() }, () => NOW)
    expect(r.isError).toBe(true)
    expect(textOf(r)).toMatch(/busy/)
  })

  it('hides internal errors from the chatbot', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const state = { forUser: (): RemoteRepo => ({ pull: async () => Promise.reject(new Error('db password wrong')), push: async () => ({ ok: false }) }) }
    const r = await runTool(tool('get_today'), {}, caller, { state, activity: new MemoryActivityStore() })
    expect(textOf(r)).not.toContain('password')
    expect(textOf(r)).toMatch(/Nothing was changed/)
    spy.mockRestore()
  })

  it('refuses writes on a read-only connection and validates input', async () => {
    const stores = { state: new MemoryStateStore(), activity: new MemoryActivityStore() }
    const ro = await runTool(tool('add_area'), { name: 'X' }, { ...caller, scopes: [SCOPES.read] }, stores)
    expect(textOf(ro)).toMatch(/read-only/)
    const bad = await runTool(tool('add_area'), { name: '' }, caller, stores)
    expect(textOf(bad)).toMatch(/Invalid input: name/)
  })

  it('still saves the change if the activity history is unavailable', async () => {
    const state = new MemoryStateStore()
    const activity = { add: async () => Promise.reject(new Error('down')), list: async () => [] }
    const r = await runTool(tool('add_area'), { name: 'Health' }, caller, { state, activity }, () => NOW)
    expect(r.isError).toBeUndefined()
    expect(state.docs.get('u1')?.state.areas.some((a) => a.name === 'Health')).toBe(true)
  })
})

describe('LevelUpOAuthProvider expiry', () => {
  let now = NOW
  const store = new MemoryOAuthStore()
  const provider = new LevelUpOAuthProvider({ store, signInUrl: 'https://x/signin', resourceUrl: 'https://x/mcp', now: () => now })
  const client = { client_id: 'c1', redirect_uris: ['https://chat/cb'] }

  it('rejects expired access tokens', async () => {
    await store.saveToken({ tokenHash: hash('tok'), kind: 'access', userId: 'u', clientId: 'c1', scopes: [], expiresAt: now + 1000 })
    await expect(provider.verifyAccessToken('tok')).resolves.toMatchObject({ extra: { userId: 'u' } })
    now += 2000
    await expect(provider.verifyAccessToken('tok')).rejects.toThrow(/expired/)
  })

  it('rejects refresh tokens used as access tokens and expired codes', async () => {
    await store.saveToken({ tokenHash: hash('ref'), kind: 'refresh', userId: 'u', clientId: 'c1', scopes: [], expiresAt: now + TTL.refreshMs })
    await expect(provider.verifyAccessToken('ref')).rejects.toThrow(/Invalid/)
    await store.saveCode({ codeHash: hash('code'), clientId: 'c1', userId: 'u', redirectUri: 'https://chat/cb', codeChallenge: 'x', scopes: [], expiresAt: now - 1 })
    await expect(provider.exchangeAuthorizationCode(client, 'code')).rejects.toThrow(/expired/)
  })

  it('will not widen scopes on refresh or accept another client’s token', async () => {
    await store.saveToken({ tokenHash: hash('r2'), kind: 'refresh', userId: 'u', clientId: 'c1', scopes: [SCOPES.read], expiresAt: now + 1e9 })
    await expect(provider.exchangeRefreshToken(client, 'r2', [SCOPES.write])).rejects.toThrow(/widen/)
    await store.saveToken({ tokenHash: hash('r3'), kind: 'refresh', userId: 'u', clientId: 'c1', scopes: [], expiresAt: now + 1e9 })
    await expect(provider.exchangeRefreshToken({ ...client, client_id: 'c2' }, 'r3')).rejects.toThrow(/Invalid/)
  })
})

describe('security review fixes', () => {
  it('truncates long activity summaries to fit the database limit', async () => {
    const state = new MemoryStateStore()
    const activity = new MemoryActivityStore()
    await runTool(tool('add_journal_entry'), { kind: 'note', text: 'x'.repeat(2000) }, caller, { state, activity }, () => NOW)
    expect(activity.entries[0]!.summary.length).toBe(500)
  })

  it('does not burn a token when an access token is sent as a refresh token', async () => {
    const store = new MemoryOAuthStore()
    const provider = new LevelUpOAuthProvider({ store, signInUrl: 'https://x/signin', resourceUrl: 'https://x/mcp', now: () => NOW })
    await store.saveToken({ tokenHash: hash('acc'), kind: 'access', userId: 'u', clientId: 'c1', scopes: [], expiresAt: NOW + 1e6 })
    await expect(provider.exchangeRefreshToken({ client_id: 'c1', redirect_uris: [] }, 'acc')).rejects.toThrow(/Invalid/)
    await expect(provider.verifyAccessToken('acc')).resolves.toBeTruthy()
  })

  it('disconnecting an app also voids its unused authorization codes', async () => {
    const store = new MemoryOAuthStore()
    const provider = new LevelUpOAuthProvider({ store, signInUrl: 'https://x/signin', resourceUrl: 'https://x/mcp', now: () => NOW })
    await store.saveCode({ codeHash: hash('c'), clientId: 'c1', userId: 'u', redirectUri: 'https://chat/cb', codeChallenge: 'x', scopes: [], expiresAt: NOW + 1e5 })
    await store.revokeConnection('u', 'c1')
    await expect(provider.exchangeAuthorizationCode({ client_id: 'c1', redirect_uris: [] }, 'c')).rejects.toThrow(/Invalid/)
  })
})
