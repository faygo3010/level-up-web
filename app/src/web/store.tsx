import { createContext, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react'
import { reducer, type Action } from '../core/reducer'
import { loadState, saveState, type KeyValueStore } from '../core/storage'
import { starterState } from '../core/defaults'
import { today as todayKey } from '../core/dates'
import type { AppState, DateKey } from '../core/types'

interface Store {
  readonly state: AppState
  readonly dispatch: (action: Action) => void
  readonly today: DateKey
  readonly saveFailed: boolean
}

const StoreContext = createContext<Store | null>(null)

function browserStore(): KeyValueStore | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

function initialState(store: KeyValueStore | null): AppState {
  return (store && loadState(store)) ?? starterState(todayKey())
}

/** Re-render when the calendar day rolls over so "today" never goes stale. */
function useToday(): DateKey {
  const [day, setDay] = useState(todayKey)
  useEffect(() => {
    const id = window.setInterval(() => setDay((prev) => (prev === todayKey() ? prev : todayKey())), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return day
}

export function StoreProvider({ children, initial }: { children: ReactNode; initial?: AppState }) {
  const kv = useMemo(browserStore, [])
  const [state, dispatch] = useReducer(reducer, undefined, () => initial ?? initialState(kv))
  const [saveFailed, setSaveFailed] = useState(false)
  const today = useToday()

  useEffect(() => {
    if (kv) setSaveFailed(!saveState(kv, state))
  }, [kv, state])

  // Remember this device's time zone so connected AI apps know your "today".
  const zone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  useEffect(() => {
    if (zone && state.settings.timeZone !== zone) dispatch({ type: 'updateSettings', settings: { timeZone: zone } })
  }, [zone, state.settings.timeZone])

  const value = useMemo(() => ({ state, dispatch, today, saveFailed }), [state, today, saveFailed])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore must be used inside <StoreProvider>')
  return store
}

/** Active (non-archived) areas, plus a lookup by id. */
export function useAreas() {
  const { state } = useStore()
  return useMemo(() => {
    const active = state.areas.filter((a) => !a.archived)
    const byId = new Map(state.areas.map((a) => [a.id, a]))
    return { active, byId }
  }, [state.areas])
}
