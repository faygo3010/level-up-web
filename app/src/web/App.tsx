import { useEffect, useState } from 'react'
import { Areas } from './screens/Areas'
import { Insights } from './screens/Insights'
import { Journal } from './screens/Journal'
import { Settings } from './screens/Settings'
import { Today } from './screens/Today'

const TABS = [
  { key: 'today', label: 'Today', icon: '◉', Screen: Today },
  { key: 'areas', label: 'Areas', icon: '▦', Screen: Areas },
  { key: 'journal', label: 'Journal', icon: '✎', Screen: Journal },
  { key: 'insights', label: 'Insights', icon: '▲', Screen: Insights },
  { key: 'prefs', label: 'Settings', icon: '⚙', Screen: Settings },
] as const

type TabKey = (typeof TABS)[number]['key']

const fromHash = (): TabKey => {
  const key = window.location.hash.replace('#', '')
  return TABS.find((t) => t.key === key)?.key ?? 'today'
}

export function App() {
  const [tab, setTab] = useState<TabKey>(fromHash)

  useEffect(() => {
    const onHash = () => setTab(fromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (key: TabKey) => {
    window.location.hash = key
    setTab(key)
    window.scrollTo?.({ top: 0 })
  }

  const { Screen } = TABS.find((t) => t.key === tab) ?? TABS[0]

  return (
    <div className="app">
      <div className="topbar">
        <span className="logo">
          Level<span>Up</span>
        </span>
      </div>
      <main>
        <Screen />
      </main>
      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'on' : ''} aria-current={tab === t.key ? 'page' : undefined} onClick={() => go(t.key)}>
            <span className="tab-icon" aria-hidden>
              {t.icon}
            </span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
