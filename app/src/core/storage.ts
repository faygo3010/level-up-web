import { appStateSchema } from './schema.js'
import type { AppState } from './types.js'

export type ParseResult = { readonly ok: true; readonly state: AppState } | { readonly ok: false; readonly error: string }

export function serializeState(state: AppState): string {
  return JSON.stringify(state, null, 2)
}

/** Parse and validate a backup or persisted blob. Never throws. */
export function parseState(json: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return { ok: false, error: 'File is not valid JSON.' }
  }
  const result = appStateSchema.safeParse(raw)
  if (!result.success) {
    const first = result.error.issues[0]
    const where = first?.path.length ? ` (at ${first.path.join('.')})` : ''
    return { ok: false, error: `This doesn't look like a Level Up backup${where}.` }
  }
  return { ok: true, state: result.data as AppState }
}

/** Storage seam so the web app (localStorage) and Expo (AsyncStorage) share logic. */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const STORAGE_KEY = 'levelup:v1'

export function loadState(store: KeyValueStore): AppState | null {
  try {
    const json = store.getItem(STORAGE_KEY)
    if (json === null) return null
    const result = parseState(json)
    return result.ok ? result.state : null
  } catch {
    return null
  }
}

export function saveState(store: KeyValueStore, state: AppState): boolean {
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}
