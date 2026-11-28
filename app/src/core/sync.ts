import { mergeStates } from './merge.js'
import type { AppState } from './types.js'

/**
 * Platform-independent sync. The whole AppState is one document per account,
 * versioned for optimistic concurrency: a push only succeeds if the server is
 * still at the version we last saw, so two devices can never silently
 * overwrite each other.
 */

export interface RemoteDoc {
  readonly state: AppState
  /** Opaque token that changes on every successful write. */
  readonly version: string
}

export type PushResult = { readonly ok: true; readonly version: string } | { readonly ok: false }

export interface RemoteRepo {
  pull(): Promise<RemoteDoc | null>
  /** Write only if the server is at baseVersion (null = no document yet). */
  push(state: AppState, baseVersion: string | null): Promise<PushResult>
}

export interface SyncMeta {
  /** Server version this device last synced with; null = never synced. */
  readonly baseVersion: string | null
  /** True when there are local edits the server hasn't seen. */
  readonly dirty: boolean
}

export interface SyncResult {
  readonly state: AppState
  readonly meta: SyncMeta
  /** True when state differs from what was passed in and the UI must update. */
  readonly changed: boolean
  readonly error?: string
}

export const NEVER_SYNCED: SyncMeta = { baseVersion: null, dirty: false }

const MAX_ATTEMPTS = 3

/** Decide what this device should hold given the server copy. */
function reconcile(local: AppState, meta: SyncMeta, remote: RemoteDoc | null, base?: AppState): { state: AppState; mustPush: boolean } {
  if (remote === null) return { state: local, mustPush: true }
  if (remote.version === meta.baseVersion) return { state: local, mustPush: meta.dirty }
  // First sign-in on this device: keep anything local, but the account wins conflicts.
  if (meta.baseVersion === null) return { state: mergeStates(remote.state, local), mustPush: true }
  if (!meta.dirty) return { state: remote.state, mustPush: false }
  // Both changed: each item takes whichever side changed it since the last sync (base).
  return { state: mergeStates(local, remote.state, base), mustPush: true }
}

/**
 * One round of sync. `base` is the copy this device last agreed with the server
 * (the state returned by the previous error-free sync), used to tell which side
 * changed each item. After an error-free sync the returned state is the new base.
 */
export async function syncOnce(local: AppState, meta: SyncMeta, repo: RemoteRepo, base?: AppState | null): Promise<SyncResult> {
  let current = local
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const remote = await repo.pull()
    const { state, mustPush } = reconcile(current, meta, remote, base ?? undefined)
    current = state

    if (!mustPush) {
      return { state, meta: { baseVersion: remote?.version ?? null, dirty: false }, changed: state !== local }
    }

    const pushed = await repo.push(state, remote?.version ?? null)
    if (pushed.ok) {
      return { state, meta: { baseVersion: pushed.version, dirty: false }, changed: state !== local }
    }
    // Another device wrote in between: treat our merged copy as local edits and retry.
    meta = { baseVersion: remote?.version ?? null, dirty: true }
  }
  return {
    state: current,
    meta: { ...meta, dirty: true },
    changed: current !== local,
    error: 'Sync kept colliding with another device. Your data is safe here; try again in a moment.',
  }
}
