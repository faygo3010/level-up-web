import { syncOnce, type PushResult, type RemoteDoc, type RemoteRepo } from '../sync'
import { routine, stateWith } from './fixtures'
import type { AppState } from '../types'

/** In-memory stand-in for the server row, with optimistic concurrency. */
class FakeRepo implements RemoteRepo {
  doc: RemoteDoc | null
  pushes = 0
  private n = 0
  /** Simulate another device writing between our pull and push. */
  interleave: AppState | null = null

  constructor(doc: RemoteDoc | null = null) {
    this.doc = doc
  }

  async pull() {
    return this.doc
  }

  async push(state: AppState, baseVersion: string | null): Promise<PushResult> {
    if (this.interleave) {
      this.doc = { state: this.interleave, version: 'other' }
      this.interleave = null
    }
    const current = this.doc?.version ?? null
    if (current !== baseVersion) return { ok: false }
    this.pushes++
    this.doc = { state, version: `v${++this.n}` }
    return { ok: true, version: this.doc.version }
  }
}

const local = stateWith({ routines: [routine({ id: 'local' })] })
const remote = stateWith({ routines: [routine({ id: 'remote' })] })

describe('syncOnce', () => {
  it('uploads local data the first time when the account is empty', async () => {
    const repo = new FakeRepo()
    const r = await syncOnce(local, { baseVersion: null, dirty: false }, repo)
    expect(repo.doc?.state).toEqual(local)
    expect(r).toEqual({ state: local, meta: { baseVersion: 'v1', dirty: false }, changed: false })
  })

  it('does nothing when already in sync', async () => {
    const repo = new FakeRepo({ state: local, version: 'v9' })
    const r = await syncOnce(local, { baseVersion: 'v9', dirty: false }, repo)
    expect(repo.pushes).toBe(0)
    expect(r.changed).toBe(false)
  })

  it('pushes local edits when the server has not moved', async () => {
    const repo = new FakeRepo({ state: remote, version: 'v9' })
    const r = await syncOnce(local, { baseVersion: 'v9', dirty: true }, repo)
    expect(repo.doc?.state).toEqual(local)
    expect(r.meta).toEqual({ baseVersion: 'v1', dirty: false })
  })

  it('adopts newer server data when there are no local edits', async () => {
    const repo = new FakeRepo({ state: remote, version: 'v9' })
    const r = await syncOnce(local, { baseVersion: 'v8', dirty: false }, repo)
    expect(r).toEqual({ state: remote, meta: { baseVersion: 'v9', dirty: false }, changed: true })
    expect(repo.pushes).toBe(0)
  })

  it('merges when both sides changed, keeping local edits on conflict', async () => {
    const repo = new FakeRepo({ state: remote, version: 'v9' })
    const r = await syncOnce(local, { baseVersion: 'v8', dirty: true }, repo)
    expect(r.state.routines.map((x) => x.id)).toEqual(['local', 'remote'])
    expect(r.changed).toBe(true)
    expect(repo.doc?.state).toEqual(r.state)
  })

  it('on a first sign-in merges with the account, letting the account win conflicts', async () => {
    const account = stateWith({ routines: [routine({ id: 'shared', title: 'From account' })] })
    const device = stateWith({ routines: [routine({ id: 'shared', title: 'Starter' }), routine({ id: 'mine' })] })
    const repo = new FakeRepo({ state: account, version: 'v3' })
    const r = await syncOnce(device, { baseVersion: null, dirty: true }, repo)
    expect(r.state.routines.map((x) => [x.id, x.title])).toEqual([
      ['shared', 'From account'],
      ['mine', 'Train'],
    ])
  })

  it('retries after a write race with another device', async () => {
    const repo = new FakeRepo({ state: remote, version: 'v9' })
    repo.interleave = stateWith({ routines: [routine({ id: 'race' })] })
    const r = await syncOnce(local, { baseVersion: 'v9', dirty: true }, repo)
    expect(r.state.routines.map((x) => x.id).sort()).toEqual(['local', 'race'])
    expect(r.meta.dirty).toBe(false)
  })

  it('gives up after repeated conflicts and keeps local data dirty', async () => {
    const repo: RemoteRepo = {
      pull: async () => ({ state: remote, version: String(Math.random()) }),
      push: async () => ({ ok: false }),
    }
    const r = await syncOnce(local, { baseVersion: 'x', dirty: true }, repo)
    expect(r.meta.dirty).toBe(true)
    expect(r.error).toMatch(/try again/i)
  })
})
